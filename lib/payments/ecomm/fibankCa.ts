/**
 * The certificate authorities Fibank's ECOMM gateways chain to.
 *
 * Both `mdpay.fibank.bg` and `mdpay-test.fibank.bg` are signed by the bank's
 * own PKI — `CS ROOT`, itself signed by the self-signed `LOCAL CA` — which no
 * public trust store carries. Without these two the handshake fails at „unable
 * to get issuer certificate" before a single byte of ECOMM is exchanged.
 *
 * Why it is safe to trust them: `CS ROOT` is the same certificate the bank
 * shipped inside our PKCS#12 keystore, so it reached us out of band, through
 * the same channel as our client certificate —
 *
 *   CS ROOT   SHA-256 03:79:77:35:30:E4:7D:0F:99:CC:E2:C8:3F:61:B4:1B:
 *                     10:52:D7:CB:AE:44:D8:F7:BA:49:BC:C3:9E:F5:3D:B0
 *   LOCAL CA  SHA-256 CD:97:55:18:E1:24:D1:3C:D3:5D:3A:A6:E8:BA:DF:89:
 *                     41:04:11:16:B1:A5:E1:18:30:2E:E3:55:91:19:37:50
 *
 * — and `LOCAL CA` is accepted only because it verifiably signed that exact
 * `CS ROOT` (`openssl verify -CAfile localca.pem csroot.pem` → OK). OpenSSL
 * will not stop at a non-self-signed anchor, so the root has to be present too;
 * pinning both here rather than reading them off the wire is the whole point.
 *
 * These are public certificates — no key material, nothing secret. They live in
 * the repo, not in env, so the trust anchor cannot be swapped by editing
 * `.env` on the server. Both expire 08.12.2039.
 */

/** CS ROOT — issuing CA of the gateway certificates and of our client cert. */
const CS_ROOT = `-----BEGIN CERTIFICATE-----
MIIEUTCCAzmgAwIBAgIEVDOShjANBgkqhkiG9w0BAQsFADBoMQswCQYDVQQGEwJC
RzERMA8GA1UECBMIQnVsZ2FyaWExDjAMBgNVBAcTBVNvZmlhMQ8wDQYDVQQKEwZG
aUJhbmsxEjAQBgNVBAsTCWVDb21tZXJjZTERMA8GA1UEAxMITE9DQUwgQ0EwHhcN
MTkxMjEzMTA1NDU2WhcNMzkxMjA4MTA1NDU2WjBnMQswCQYDVQQGEwJCRzERMA8G
A1UECBMIQnVsZ2FyaWExDjAMBgNVBAcTBVNvZmlhMQ8wDQYDVQQKEwZGaUJhbmsx
EjAQBgNVBAsTCWVDb21tZXJjZTEQMA4GA1UEAxMHQ1MgUk9PVDCCASIwDQYJKoZI
hvcNAQEBBQADggEPADCCAQoCggEBAKXxyl8ApQbxZERu9KizVLk5yvvoRuOb08OK
f1VRVvk8VdzojEuxl6avAvMeRdaA/vj7cDjvikYyW0TlsohzB+YolgkboqGDgOxy
eYS7n8aUG07fDeJ9dX2zt5HLpA4c9WOGnF3LPh1aKj/Drw2R1lGNW8UN8HoytQ8U
8sjr+JSWhmVTXfJ8AFulYdbHoTU0XnjE4M7g2sWaPRnwNQQ5iVVhbkmTQ9Obd2DU
IJ6AaZZ8tUmySXl58v+hOXbFf3QG1/sJXHakJ6Y5aWM+WJZUx/K3FpZP7WaMz3Tg
zQH6k4r5rqsn5vL+ut9pEUF86ZK2RRzfNclVXAwnJqiYmfs0EgECAwEAAaOCAQIw
gf8wHQYDVR0OBBYEFA6a01tUKO5X6IRhDYbqAhs5eZ09MIGaBgNVHSMEgZIwgY+A
FK+DEQwvA+uqbGEtL+yCYOA0hfXqoWykajBoMQswCQYDVQQGEwJCRzERMA8GA1UE
CBMIQnVsZ2FyaWExDjAMBgNVBAcTBVNvZmlhMQ8wDQYDVQQKEwZGaUJhbmsxEjAQ
BgNVBAsTCWVDb21tZXJjZTERMA8GA1UEAxMITE9DQUwgQ0GCCQDQH/dZhxGqkzAS
BgNVHRMBAf8ECDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIChDAdBgNVHSUEFjAUBggr
BgEFBQcDAQYIKwYBBQUHAwIwDQYJKoZIhvcNAQELBQADggEBAJL1Yq8g8DZzUejj
bKBh6T7g6WHXMsdMrrCYeMldLttKvep48KCzxH3nqrTzHyq1rkqF7Yo9nv1cHEzx
By2XkWIW33RGYBmwlr8sZunixJXqOM/ZTEuuBKbYy/xgj5AlrEpQk/AlV1ps+CR/
vJ5LJlrnx3MPHGllX4mETXvBVCtcOTs7sAkCCYw8otu0Lfnp43BhT5SEN5VpPlqZ
lIkVwGsENTDqItugXEJMazzKR0aukDky0mPsidP/XntB8LJZ1JhAFYbWVTeqpPdj
pvsVrJh6f4bHbK+O92nBB0ii06G7krirbxW8tuZPFoUzpuolrA9Z86prWvLJJ7SJ
aXdGwDQ=
-----END CERTIFICATE-----`;

/** LOCAL CA — the self-signed root above it, and the anchor OpenSSL needs. */
const LOCAL_CA = `-----BEGIN CERTIFICATE-----
MIIEVzCCAz+gAwIBAgIJANAf91mHEaqTMA0GCSqGSIb3DQEBCwUAMGgxCzAJBgNV
BAYTAkJHMREwDwYDVQQIEwhCdWxnYXJpYTEOMAwGA1UEBxMFU29maWExDzANBgNV
BAoTBkZpQmFuazESMBAGA1UECxMJZUNvbW1lcmNlMREwDwYDVQQDEwhMT0NBTCBD
QTAeFw0xOTEyMTMxMDUwNDVaFw0zOTEyMDgxMDUwNDVaMGgxCzAJBgNVBAYTAkJH
MREwDwYDVQQIEwhCdWxnYXJpYTEOMAwGA1UEBxMFU29maWExDzANBgNVBAoTBkZp
QmFuazESMBAGA1UECxMJZUNvbW1lcmNlMREwDwYDVQQDEwhMT0NBTCBDQTCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKCBhEMIfVSocV7ds25f8BHgxyJz
FdApMz2BoaUzBFf9FPy7QDFiks7aQ1MsY6lHXqlkq34LCKsFpIWvDM5EfwmYa1bd
3gjik3Jya7JOOrCywB9B0LLGCjQixPYIDo35hysLLL/n+YOLVM3HnZqaepplklq3
SrJ5iJF6s5gLZ7pbkfQKDuoK80+pfGbExJPk18q//keCn1DXTd+tNKzT7adGVPf/
kS682D+1R0N6L/ZjdKqkTmpMdmvkGInTD/ZD7MvKoJ3m3jnxMVzVzO6e4ls4xUcM
0/y5w/SDIZCYMqvXxz8mrntDeI+mdOxn6hmU4AuWiIxwnOnFOxuSXyssL2kCAwEA
AaOCAQIwgf8wHQYDVR0OBBYEFK+DEQwvA+uqbGEtL+yCYOA0hfXqMIGaBgNVHSME
gZIwgY+AFK+DEQwvA+uqbGEtL+yCYOA0hfXqoWykajBoMQswCQYDVQQGEwJCRzER
MA8GA1UECBMIQnVsZ2FyaWExDjAMBgNVBAcTBVNvZmlhMQ8wDQYDVQQKEwZGaUJh
bmsxEjAQBgNVBAsTCWVDb21tZXJjZTERMA8GA1UEAxMITE9DQUwgQ0GCCQDQH/dZ
hxGqkzASBgNVHRMBAf8ECDAGAQH/AgEBMA4GA1UdDwEB/wQEAwIChDAdBgNVHSUE
FjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDQYJKoZIhvcNAQELBQADggEBAEMi9UPy
JM5JM367JkjdHMit3RKj2Noj5+La/F+p0SnIF1hapiZK47FEr9hKn8LaS1kkLL09
Sxgtl2S0cQkoZvsDbQctA9XZyFS9ELh82yURxkqUg7NvSHkEFVO9bN1Bz3dbAy7C
883EyATpB8RkwYR2UIcnxP/KpjRftNwU4vZbHT8kFUj0MUL5vAlH7Py1Apmn8WuB
EZ2VLv2ve7ThYoNIyLt/i+oyz5QYTgvkBnK4e02OsUlm4queefunSe4y3yRHvw3+
3izhG6T5rdXjJE6coEIuMLq7HL6j8VjUEKkVCQVnJVu56ZxliuOeRcyKp34L9n7N
PtKWQ0rHNNenxRI=
-----END CERTIFICATE-----`;

export const FIBANK_CA_PEM: readonly string[] = [CS_ROOT, LOCAL_CA];
