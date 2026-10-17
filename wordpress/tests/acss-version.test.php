<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
require_once __DIR__ . '/../src/Framework/Routes/AcssVersion.php';
use PixflowDesign\WordPress\Framework\Routes\AcssVersion;
foreach (['3.3.6' => 'acss_v3', '4.0.1' => 'acss_v4', '2.8.0' => null, '5.0.0' => null, '' => null, 'invalid' => null] as $version => $profile) {
    $result = AcssVersion::classify($version);
    if ($result['mappingProfile'] !== $profile || $result['supported'] !== ($profile !== null)) throw new RuntimeException('Incorrect version profile');
}
echo "ACSS version profiles passed\n";
