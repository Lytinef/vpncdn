# Чистый тест прямого режима (reality) БЕЗ отключения VPN.
# Добавляет host-route только для IP сервера через реальный шлюз, гоняет
# reality-клиент, пишет результат в файл, убирает маршрут.
$ErrorActionPreference = 'SilentlyContinue'
$out = "$env:LOCALAPPDATA\Unway\direct-test.txt"
"=== direct reality test $(Get-Date -Format o) ===" | Out-File $out
$xray = "D:\vpncdn\client\build\windows\x64\runner\Release\xray.exe"
if (-not (Test-Path $xray)) { "xray not found: $xray" | Out-File $out -Append; exit }

# Реальный шлюз (физический интерфейс; wintun держит только /1, поэтому 0.0.0.0/0 = физика).
$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop
"gateway=$gw" | Out-File $out -Append

# Точечный маршрут к серверу мимо туннеля.
$r = route add 169.40.1.216 mask 255.255.255.255 $gw metric 1
"route add -> $r" | Out-File $out -Append

# Конфиг reality-клиента.
$cfg = @'
{
  "log":{"loglevel":"warning"},
  "inbounds":[{"tag":"s","listen":"127.0.0.1","port":10899,"protocol":"socks","settings":{"udp":false}}],
  "outbounds":[{"protocol":"vless","settings":{"vnext":[{"address":"169.40.1.216","port":2053,"users":[{"id":"396b03c3-0847-4eb9-84d0-e1b5a2f954bc","encryption":"none","flow":"xtls-rprx-vision"}]}]},"streamSettings":{"network":"tcp","security":"reality","realitySettings":{"serverName":"www.microsoft.com","publicKey":"-oB_3aZAD9plHzR3DbrYG_XOcMv3BinI8dTOFvRAZCI","shortId":"a55b174e3012a001","fingerprint":"chrome","show":true}}}]
}
'@
$cfgPath = "$env:TEMP\direct-cli.json"
$cfg | Out-File $cfgPath -Encoding ascii
$xlog = "$env:TEMP\direct-xray.log"
$p = Start-Process -FilePath $xray -ArgumentList "run","-config","$cfgPath" -PassThru -WindowStyle Hidden -RedirectStandardOutput $xlog -RedirectStandardError "$env:TEMP\direct-xray.err"
Start-Sleep -Seconds 4

$ip = & curl.exe -s --max-time 15 -x socks5h://127.0.0.1:10899 https://api.ipify.org
"result_ip=[$ip]" | Out-File $out -Append
"curl_exit=$LASTEXITCODE  (0=ок, 28=таймаут)" | Out-File $out -Append

Stop-Process -Id $p.Id -Force
"--- xray client log ---" | Out-File $out -Append
Get-Content $xlog, "$env:TEMP\direct-xray.err" -ErrorAction SilentlyContinue | Select-Object -Last 15 | Out-File $out -Append

$rd = route delete 169.40.1.216
"route delete -> $rd" | Out-File $out -Append
"=== done ===" | Out-File $out -Append
