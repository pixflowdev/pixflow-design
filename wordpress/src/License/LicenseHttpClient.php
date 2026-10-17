<?php

declare(strict_types=1);

namespace PixflowDesign\WordPress\License;

if (!defined('ABSPATH')) {
    exit;
}

final class LicenseHttpClient
{
    public function post_json(string $url, array $payload): array|\WP_Error
    {
        $response = wp_remote_post($url, [
            'timeout' => 20,
            'redirection' => 0,
            'headers' => [
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($payload),
        ]);

        if (!is_wp_error($response)) {
            return [
                'status' => (int) wp_remote_retrieve_response_code($response),
                'body' => (string) wp_remote_retrieve_body($response),
            ];
        }

        if (!$this->should_try_powershell_fallback($response)) {
            return $response;
        }

        return $this->post_json_with_powershell($url, $payload);
    }

    private function should_try_powershell_fallback(\WP_Error $error): bool
    {
        // Pixflow-owned: some local Windows PHP builds have no curl/openssl, so
        // WordPress cannot reach the HTTPS license server. Use PowerShell only
        // for that local transport gap; hosted installs keep WordPress HTTP.
        return PHP_OS_FAMILY === 'Windows'
            && function_exists('proc_open')
            && str_contains(strtolower($error->get_error_message()), 'no working transports');
    }

    private function post_json_with_powershell(string $url, array $payload): array|\WP_Error
    {
        $temp_dir = get_temp_dir();
        $body_file = tempnam($temp_dir, 'pixflow-license-body');
        $response_file = tempnam($temp_dir, 'pixflow-license-response');
        $status_file = tempnam($temp_dir, 'pixflow-license-status');
        $error_file = tempnam($temp_dir, 'pixflow-license-error');

        if (!$body_file || !$response_file || !$status_file || !$error_file) {
            return new \WP_Error('pixflow_license_tempfile_failed', 'Could not create temporary files for license validation.');
        }

        try {
            file_put_contents($body_file, (string) wp_json_encode($payload));

            $script = implode("\n", [
                '$ErrorActionPreference = "Stop";',
                '$headers = @{ Accept = "application/json" };',
                '$body = Get-Content -Raw -LiteralPath ' . $this->powershell_quote($body_file) . ';',
                'try {',
                '  $response = Invoke-WebRequest -Uri ' . $this->powershell_quote($url) . ' -Method Post -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 20 -MaximumRedirection 0 -UseBasicParsing;',
                '  Set-Content -LiteralPath ' . $this->powershell_quote($status_file) . ' -Value ([int]$response.StatusCode) -Encoding UTF8;',
                '  Set-Content -LiteralPath ' . $this->powershell_quote($response_file) . ' -Value ([string]$response.Content) -Encoding UTF8;',
                '} catch {',
                '  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {',
                '    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream());',
                '    Set-Content -LiteralPath ' . $this->powershell_quote($response_file) . ' -Value $reader.ReadToEnd() -Encoding UTF8;',
                '    Set-Content -LiteralPath ' . $this->powershell_quote($status_file) . ' -Value ([int]$_.Exception.Response.StatusCode) -Encoding UTF8;',
                '    exit 0;',
                '  }',
                '  Set-Content -LiteralPath ' . $this->powershell_quote($error_file) . ' -Value ([string]$_.Exception.Message) -Encoding UTF8;',
                '  exit 1;',
                '}',
            ]);

            $result = $this->run_powershell($script);
            if ($result !== 0) {
                $message = trim($this->read_text_file($error_file));
                return new \WP_Error('pixflow_license_powershell_failed', $message !== '' ? $message : 'PowerShell license validation failed.');
            }

            return [
                'status' => max(0, (int) trim($this->read_text_file($status_file))),
                'body' => $this->read_text_file($response_file),
            ];
        } finally {
            @unlink($body_file);
            @unlink($response_file);
            @unlink($status_file);
            @unlink($error_file);
        }
    }

    private function run_powershell(string $script): int
    {
        $utf16_script = function_exists('mb_convert_encoding')
            ? mb_convert_encoding($script, 'UTF-16LE', 'UTF-8')
            : (string) iconv('UTF-8', 'UTF-16LE//IGNORE', $script);
        $encoded_script = base64_encode($utf16_script);
        $command = 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' . escapeshellarg($encoded_script);
        $descriptor_spec = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $process = proc_open($command, $descriptor_spec, $pipes);
        if (!is_resource($process)) {
            return 1;
        }

        fclose($pipes[0]);
        stream_get_contents($pipes[1]);
        stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return (int) proc_close($process);
    }

    private function powershell_quote(string $value): string
    {
        return "'" . str_replace("'", "''", $value) . "'";
    }

    private function read_text_file(string $file): string
    {
        $contents = (string) @file_get_contents($file);

        // Pixflow-owned: Windows PowerShell 5 Set-Content writes UTF-8 with a
        // BOM, which breaks integer casts and json_decode in PHP.
        return preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?? $contents;
    }
}
