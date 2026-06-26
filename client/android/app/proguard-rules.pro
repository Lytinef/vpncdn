# gomobile / Xray-ядро: классы вызываются из нативного кода через JNI,
# R8 не должен их трогать (иначе краш "failed to find method Seq.getRef").
-keep class go.** { *; }
-keep class libv2ray.** { *; }
# tun2socks JNI-обёртка
-keep class com.vpncdn.client.vpn.Tun2socks { *; }
# AmneziaWG: нативные методы вызываются по JNI из libwg-go.so
# (символы Java_com_vpncdn_client_vpn_AwgCore_*) — класс и методы не трогать.
-keep class com.vpncdn.client.vpn.AwgCore { *; }
-keepclasseswithmembernames class * { native <methods>; }
