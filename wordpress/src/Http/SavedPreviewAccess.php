<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Http;

/** Short-lived, header-only access to one saved frontend document. Never a login cookie. */
final class SavedPreviewAccess
{
    private static function key(string $token): string { return 'pixflow_preview_' . hash('sha256', $token); }

    public static function issue(array $session, string $sessionKey, int $postId): array
    {
        $post = get_post($postId);
        $target = $session['editorTarget'] ?? null;
        if (!$target || (int) ($target['postId'] ?? 0) !== $postId || !$post || !in_array($post->post_type, ['page', 'post'], true)
            || in_array($post->post_status, ['trash', 'auto-draft'], true) || !current_user_can('read_post', $postId)) {
            throw new \RuntimeException('Saved preview access requires the connected page or post. Save it first; other documents and templates are not authorized.');
        }
        $token = bin2hex(random_bytes(32));
        set_transient(self::key($token), ['postId'=>$postId,'userId'=>get_current_user_id(),'blogId'=>get_current_blog_id(),
            'sessionKey'=>$sessionKey,'expiresAt'=>time()+180], 180);
        return ['token'=>$token,'postId'=>$postId,'url'=>add_query_arg([$post->post_type === 'page' ? 'page_id' : 'p'=>$postId,'preview'=>'true'],home_url('/'))];
    }

    public static function revoke(string $token, string $sessionKey): void
    {
        $grant = get_transient(self::key($token));
        if (is_array($grant) && hash_equals((string)$grant['sessionKey'], $sessionKey)) delete_transient(self::key($token));
    }

    public static function register(): void
    {
        add_filter('determine_current_user', [self::class, 'authenticate'], 99);
    }

    public static function authenticate($current)
    {
        $token = $_SERVER['HTTP_X_PIXFLOW_PREVIEW'] ?? '';
        if ($token === '') return $current;
        $grant = preg_match('/^[a-f0-9]{64}$/D', $token) ? get_transient(self::key($token)) : false;
        $session = is_array($grant) ? get_transient((string)$grant['sessionKey']) : false;
        $uri = wp_parse_url((string)($_SERVER['REQUEST_URI'] ?? ''));
        $query=[];parse_str((string)($uri['query'] ?? ''),$query);
        $path=wp_parse_url(home_url('/'),PHP_URL_PATH) ?: '/';
        $post = is_array($grant) ? get_post((int)$grant['postId']) : null;
        $queryKey = $post && $post->post_type === 'page' ? 'page_id' : 'p';
        if (!is_array($grant) || !is_array($session) || ($grant['expiresAt'] ?? 0)<=time() || ($session['expiresAt'] ?? 0)<=time()
            || !$post || !in_array($post->post_type, ['page','post'], true) || in_array($post->post_status, ['trash','auto-draft'], true)
            || (int)$grant['blogId']!==get_current_blog_id() || (int)($session['blogId'] ?? 0)!==get_current_blog_id() || (int)$session['userId']!==(int)$grant['userId']
            || ($_SERVER['REQUEST_METHOD'] ?? '')!=='GET' || ($uri['path'] ?? '/')!==$path
            || count($query)!==2 || ($query['preview'] ?? '')!=='true' || (string)($query[$queryKey] ?? '')!==(string)$grant['postId']
            || !user_can((int)$grant['userId'],'read_post',(int)$grant['postId'])) {
            wp_die('Saved preview access expired or does not match this document.', 'Preview unavailable', ['response'=>403]);
        }
        add_filter('show_admin_bar', '__return_false');
        add_filter('wp_headers', static function(array $headers): array {
            $headers['Cache-Control']='private, no-store, max-age=0';
            $headers['Referrer-Policy']='no-referrer';
            $headers['X-Robots-Tag']='noindex, nofollow';
            return $headers;
        });
        return (int)$grant['userId'];
    }
}
