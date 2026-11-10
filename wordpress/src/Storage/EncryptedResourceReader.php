<?php
declare(strict_types=1);
namespace PixflowDesign\WordPress\Storage;
if (!defined('ABSPATH')) exit;

/** Read-only compatibility for directory iterators and authenticated resource readers.
 * Deliberately refuses PHP includes, writes and arbitrary filesystem destinations.
 * Mounts exist only in the current request and are never accepted from a client.
 */
final class EncryptedResourceReader
{
    public $context;
    private static array $mounts = [];
    private string $bytes = '';
    private int $position = 0;
    private array $children = [];
    public static function mount(EncryptedResourceTree $tree): string
    {
        if (!in_array('pixflow-resource', stream_get_wrappers(), true)
            && !stream_wrapper_register('pixflow-resource', self::class)) throw new \RuntimeException('Resource reader unavailable.');
        $id = $tree->mount_id();
        self::$mounts[$id] = $tree;
        return 'pixflow-resource://' . $id;
    }
    public static function is_resource(string $path): bool { return str_starts_with($path, 'pixflow-resource://'); }
    private static function resolve(string $path): array
    {
        // SPL uses the platform separator when descending into a mounted directory.
        $path = str_replace('\\', '/', $path);
        if (!preg_match('~^pixflow-resource://([a-f0-9]{32})(?:/(.*))?$~D', $path, $match) || !isset(self::$mounts[$match[1]])) throw new \RuntimeException('Invalid resource mount.');
        $name = $match[2] ?? '';
        if ($name !== '') EncryptedResourceTree::name($name);
        return [self::$mounts[$match[1]], $name];
    }
    /** realpath does not support wrappers; canonicalize only registered mounts. */
    public static function canonical(string $path): string|false
    {
        if (!self::is_resource($path)) return realpath($path);
        try { self::resolve($path); return (new self())->url_stat($path, 0) === false ? false : $path; }
        catch (\Throwable) { return false; }
    }
    public function url_stat(string $path, int $flags): array|false
    {
        try {
            [$tree, $name] = self::resolve($path);
            $entries = $tree->entries();
            $directory = $name === '';
            if (!isset($entries[$name])) foreach ($entries as $key => $_entry) if (str_starts_with($key, $name . '/')) { $directory = true; break; }
            if (!$directory && !isset($entries[$name])) return false;
            // Virtual permissions describe this PHP reader, not public disk access.
            // Do not accidentally deny PHP-FPM's non-root uid on Linux hosts.
            $mode = $directory ? 0040555 : 0100444;
            $size = $directory ? 0 : $entries[$name]['bytes'];
            return [0=>0,1=>0,2=>$mode,3=>1,4=>0,5=>0,6=>0,7=>$size,8=>0,9=>0,10=>0,11=>-1,12=>-1,
                'dev'=>0,'ino'=>0,'mode'=>$mode,'nlink'=>1,'uid'=>0,'gid'=>0,'rdev'=>0,'size'=>$size,'atime'=>0,'mtime'=>0,'ctime'=>0,'blksize'=>-1,'blocks'=>-1];
        } catch (\Throwable) { return false; }
    }
    public function stream_open(string $path, string $mode, int $options, ?string &$opened_path): bool
    {
        // STREAM_OPEN_FOR_INCLUDE is internal PHP flag 128, not exposed on all PHP builds.
        if (($options & 128) !== 0 || !in_array($mode, ['r','rb','rt'], true)) return false;
        try { [$tree,$name]=self::resolve($path);$this->bytes=$tree->read($name);$this->position=0;$opened_path=$path;return true; }
        catch (\Throwable) { return false; }
    }
    public function stream_read(int $count): string { $value=substr($this->bytes,$this->position,$count);$this->position+=strlen($value);return $value; }
    public function stream_eof(): bool { return $this->position>=strlen($this->bytes); }
    public function stream_tell(): int { return $this->position; }
    public function stream_seek(int $offset, int $whence=SEEK_SET): bool
    {
        $next=match($whence){SEEK_SET=>$offset,SEEK_CUR=>$this->position+$offset,SEEK_END=>strlen($this->bytes)+$offset,default=>-1};
        if($next<0||$next>strlen($this->bytes))return false;$this->position=$next;return true;
    }
    public function stream_stat(): array { return ['size'=>strlen($this->bytes),'mode'=>0100444,7=>strlen($this->bytes),2=>0100444]; }
    public function stream_set_option(int $option, int $arg1, int $arg2): bool { return false; }
    public function dir_opendir(string $path, int $options): bool
    {
        try {
            [$tree,$name]=self::resolve($path);
            $stat=$this->url_stat($path,0);if(!$stat||($stat['mode']&0170000)!==0040000)return false;
            $prefix=$name===''?'':$name.'/';$children=[];
            foreach($tree->entries()as$key=>$_entry)if(str_starts_with($key,$prefix))$children[explode('/',substr($key,strlen($prefix)))[0]]=true;
            $this->children=array_keys($children);sort($this->children,SORT_STRING);$this->position=0;return true;
        }catch(\Throwable){return false;}
    }
    public function dir_readdir(): string|false { return $this->children[$this->position++]??false; }
    public function dir_rewinddir(): bool { $this->position=0;return true; }
    public function dir_closedir(): bool { $this->children=[];return true; }
}
