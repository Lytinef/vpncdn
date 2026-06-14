# gomobile / Xray-ядро: классы вызываются из нативного кода через JNI,
# R8 не должен их трогать (иначе краш "failed to find method Seq.getRef").
-keep class go.** { *; }
-keep class libv2ray.** { *; }
# tun2socks JNI-обёртка
-keep class com.vpncdn.client.vpn.Tun2socks { *; }
