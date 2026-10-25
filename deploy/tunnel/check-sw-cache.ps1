$ErrorActionPreference = 'Continue'
$urls = @('https://app.wksl.site/sw.js', 'https://wksl.site/sw.js')
$hasPushRe = [regex]"addEventListener\(\s*'push'"
foreach ($u in $urls) {
  foreach ($i in 1..2) {
    try {
      $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 20
      $hasPush = if ($hasPushRe.IsMatch($r.Content)) { 'push:OK' } else { 'push:MISSING' }
      Write-Output ("{0} req{1} cf={2} age={3} bytes={4} {5}" -f $u, $i, $r.Headers['cf-cache-status'], $r.Headers['age'], $r.RawContentLength, $hasPush)
    } catch {
      Write-Output ("{0} req{1} ERR {2}" -f $u, $i, $_.Exception.Message)
    }
  }
}
