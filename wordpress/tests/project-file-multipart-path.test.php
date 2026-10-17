<?php

declare(strict_types=1);

$source = (string) file_get_contents(dirname(__DIR__) . '/src/Http/RestController.php');
$start = strpos($source, 'if ($suffix === \'\' && $method === \'POST\') {');
$end = $start === false ? false : strpos($source, 'if ($suffix !== \'\' && $method === \'GET\')', $start);
$route = $start === false || $end === false ? '' : substr($source, $start, $end - $start);

function assert_project_file_multipart_path(bool $condition, string $message): void
{
    if ($condition) return;
    fwrite(STDERR, $message . "\n");
    exit(1);
}

assert_project_file_multipart_path(
    str_contains($route, '$request->get_body_params()'),
    'Multipart project-file writes must preserve request body fields such as the project-relative path.',
);
assert_project_file_multipart_path(
    str_contains($route, '$request->get_json_params()'),
    'JSON project-file writes must retain their existing request contract.',
);
assert_project_file_multipart_path(
    str_contains($route, 'array_merge('),
    'The project-file route must combine multipart and JSON fields before writing.',
);
assert_project_file_multipart_path(
    str_contains($route, '$this->project_files->write(') && str_contains($route, '$body,'),
    'The combined project-file fields must be passed to ProjectFileService.',
);

echo "Pixflow Design multipart project-file path tests passed.\n";
