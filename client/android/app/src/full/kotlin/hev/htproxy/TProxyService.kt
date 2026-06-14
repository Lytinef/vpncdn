package hev.htproxy

/**
 * Точка входа нативной библиотеки hev-socks5-tunnel.
 * libhev-socks5-tunnel.so в JNI_OnLoad регистрирует натив-методы именно на
 * класс hev/htproxy/TProxyService — поэтому он обязан существовать с этими
 * сигнатурами. hev сам управляет рабочим потоком туннеля.
 */
object TProxyService {
    init {
        System.loadLibrary("hev-socks5-tunnel")
    }

    external fun TProxyStartService(configPath: String, fd: Int)
    external fun TProxyStopService()
    external fun TProxyGetStats(): LongArray
}
