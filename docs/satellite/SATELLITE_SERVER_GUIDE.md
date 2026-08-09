# Satellite-Server: Implementierungsleitfaden

Begleitdokument zu [SATELLITE_PROTOCOL.md](./SATELLITE_PROTOCOL.md). Die Spezifikation
beschreibt **was** über die Leitung geht; dieser Leitfaden beschreibt, **wie** wir die
Serverseite bauen und in welcher Reihenfolge.

---

## 1. Ziel und Rollenbild

Normalerweise ist **Companion** der Server und *Companion Satellite* der Client. Wir
drehen das nicht um — wir **ersetzen Companion als Server**. Unsere Anwendung öffnet
Port 16622 (und optional 16623), und alle vorhandenen Satellite-Clients verbinden sich
darauf, ohne Änderung.

```
┌──────────────────────┐        Satellite-Protokoll        ┌─────────────────────────┐
│  Unsere C#-App       │◀───────  TCP 16622 / WS 16623  ───▶│  Companion Satellite    │
│  (Satellite-SERVER)  │                                   │  + Stream Deck / etc.   │
└──────────────────────┘                                   └─────────────────────────┘
```

**Was wir dadurch geschenkt bekommen:** Stream Deck (alle Modelle), Stream Deck Studio,
Loupedeck, X-keys, Infinitton, Contour Shuttle, das Raspberry-Pi-Image — die gesamte
Gerätepflege, Firmware-Eigenheiten und HID-Arbeit liegen beim Client.

**Was wir dafür liefern müssen:** gerenderte Button-Bilder. Das ist der eigentliche
Arbeitsblock, siehe §6.

> **Nicht vergessen:** Companion Satellite ist Bitfocus' App. Wir nutzen deren Client
> für unser Produkt. Das Protokoll ist offen und versioniert und ausdrücklich für
> Fremdclients gedacht — aber die Server-Rolle sollte im nächsten Gespräch mit Bitfocus
> ausdrücklich erwähnt werden. Die bisherige Absprache deckt den Store ab, nicht das hier.

---

## 2. Umfang: was ist Pflicht, was optional

### Minimal lauffähig (ein Client verbindet sich und zeigt Tasten an)

| Element | Aufwand |
|---|---|
| TCP-Listener, Zeilenframing, Parser (§3 der Spec) | klein |
| `BEGIN` + `CAPS` beim Connect | trivial |
| `PING` → `PONG`, 5-s-Timeout-Handling | trivial |
| `ADD-DEVICE` (Legacy-Grid) / `REMOVE-DEVICE` | klein |
| `KEY-PRESS` entgegennehmen | trivial |
| `KEY-STATE` senden (Farbe + Text, ohne Bitmap) | klein |
| `KEYS-CLEAR` | trivial |

Das ist ein Wochenende. Mit `COLORS=hex` und `TEXT=1` zeigt Companion Satellite bereits
etwas Sinnvolles an, ganz ohne Bitmap-Rendering.

### Für ein ernsthaftes Produkt zusätzlich

| Element | Aufwand |
|---|---|
| Bitmap-Rendering + `BITMAP` in `rgb` | **groß** (§6) |
| `png`/`webp`-Kodierung + `BITMAP_FORMATS` in `CAPS` | mittel |
| `BRIGHTNESS` | trivial |
| `KEY-ROTATE` inkl. Betragssemantik | klein |
| Manifest-Modus (`LAYOUT_MANIFEST`, `CONTROLID`) | mittel |
| `LOCKED-STATE` + `PINCODE-KEY` | mittel |
| Transferable Values (`VARIABLES`, `SET-VARIABLE-VALUE`, `VARIABLE-VALUE`) | mittel |
| `CONFIG_FIELDS` + `DEVICE-CONFIG` | mittel — setzt eine UI für Surface-Einstellungen voraus |
| `CHANGE-PAGE` | klein — setzt ein Seitenmodell voraus |
| Subscriptions (`ADD-SUB` …) | mittel |
| `FIRMWARE-UPDATE-INFO` | trivial (nur weiterreichen/anzeigen) |
| WebSocket-Transport | klein |
| `LEDS` (Stream Deck Studio) | mittel |

---

## 3. Meilensteine

**M0 — Wire-Ebene.** Listener, Zeilenframing, Parser, Serializer, Keepalive. Testbar
mit `telnet`/`nc`: verbinden, `BEGIN`/`CAPS` sehen, `PING` schicken, `PONG` bekommen.
Vorher nichts anderes anfangen — jeder Fehler hier vergiftet alles Weitere.

**M1 — Device-Lebenszyklus.** `ADD-DEVICE` (Legacy-Grid), Registry, `REMOVE-DEVICE`,
Cleanup beim Verbindungsabbruch. Erster echter Test mit Companion Satellite: das Gerät
muss in unserer App erscheinen.

**M2 — Eingaben.** `KEY-PRESS`, `KEY-ROTATE`. Ab hier ist die Hardware nutzbar, auch
wenn das Display noch leer bleibt.

**M3 — Ausgabe ohne Grafik.** `KEY-STATE` mit `COLOR`/`TEXTCOLOR`/`TEXT`, plus
`KEYS-CLEAR` und `BRIGHTNESS`. Erster Ende-zu-Ende-Durchstich.

**M4 — Bitmaps.** Renderer + `BITMAP` in `rgb`. Danach `png`/`webp`. Ab hier sieht es
aus wie ein Produkt.

**M5 — Manifest-Modus.** `LAYOUT_MANIFEST` parsen, `CONTROLID`-Adressierung,
Style-Presets pro Control. Nötig für Geräte mit gemischten Bedienelementen
(Stream Deck +, Studio, Loupedeck).

**M6 — Konfiguration & Variablen.** `CONFIG_FIELDS`/`DEVICE-CONFIG`, Transferable
Values. Setzt eine Einstellungs-UI pro Surface voraus.

**M7 — Sperre und Subscriptions.** `LOCKED-STATE`/`PINCODE-KEY`, Subscription-API.

---

## 4. Architekturvorschlag (C#)

```
SatelliteServer                 Listener(s), Konfiguration, Lifecycle
 ├─ SatelliteTcpListener        TcpListener :16622
 ├─ SatelliteWsListener         optional, :16623
 └─ SatelliteConnection         eine Instanz je Verbindung
     ├─ LineReader              Puffer, \n-Split, 2-MiB-Limit, \r-Behandlung
     ├─ MessageParser           exakter Port von parseLineParameters
     ├─ MessageWriter           Serialisierung inkl. Quoting-Regeln
     ├─ IdleTimer               Trennung nach 5 s ohne Empfang
     ├─ SubscriptionSet         SUBID → (Location, Style, BitmapFormat)
     └─ DeviceRegistry          DEVICEID → SatelliteDevice
         └─ SatelliteDevice     Layout, Style-Presets, Grid, Sendezustand
             └─ DrawQueue       ein Slot pro Control (Coalescing!)
```

### Threading

Ein `Task` pro Verbindung für den Lesepfad. Schreibpfad über eine serialisierte Queue
(`Channel<string>` mit einem Writer-Task) — **niemals** aus mehreren Threads direkt auf
den `NetworkStream` schreiben, sonst verschränken sich Zeilen.

### Backpressure: der wichtigste Punkt

Companion nutzt eine `ImageWriteQueue`, die **pro Control nur den jeweils neuesten
Frame** behält und ältere verwirft. Das ist keine Optimierung, sondern notwendig: bei
32 Tasten × 96×96 px × 3 Byte sind das ~885 kB pro Vollbild-Update. Wer jeden
Zwischenzustand sendet, füllt den Socket-Puffer schneller, als der Client ihn leert,
und die Latenz läuft weg.

Regel: **ein ausstehender Frame pro Control**, neuer Frame ersetzt den alten. Erst
senden, wenn der vorherige Schreibvorgang abgeschlossen ist.

### Codeskizze: Parser (exakter Port)

Die Regeln aus §3.2 der Spec, 1:1:

```csharp
public static Dictionary<string, string?> ParseLineParameters(string line)
{
    var fragments = new List<StringBuilder> { new() };
    var quoted = false;
    var i = 0;

    while (i < line.Length)
    {
        var c = line[i];
        if (c == '\\')
        {
            // Escaped: nächstes Zeichen wörtlich, beide konsumieren
            if (i + 1 < line.Length) fragments[^1].Append(line[i + 1]);
            i += 2;
            continue;
        }
        i++;
        if (c == '"') quoted = !quoted;
        else if (c == ' ' && !quoted) fragments.Add(new StringBuilder());
        else fragments[^1].Append(c);
    }

    var result = new Dictionary<string, string?>(StringComparer.Ordinal);
    foreach (var sb in fragments)
    {
        var fragment = sb.ToString();
        var split = fragment.IndexOf('=');
        if (split == -1)
        {
            if (fragment.Length == 0) continue;
            result[fragment] = null;            // null == Flag ohne Wert (JS: true)
        }
        else
        {
            var key = fragment[..split];
            if (key.Length == 0) continue;
            result[key] = fragment[(split + 1)..];   // Rest inkl. weiterer '='
        }
    }
    return result;
}
```

> `null` steht hier für den JS-Wert `true` (Flag ohne `=`). Diese Unterscheidung ist
> nicht kosmetisch — siehe die `isTruthy`/`isFalsey`-Falle in §3.4 der Spec. Ein
> `bool?`-Rückgabetyp für die Boolean-Auswertung hilft, den Unterschied nicht zu
> verlieren.

### Codeskizze: Serializer

```csharp
public void SendMessage(string name, string? status, string? deviceId,
                        IEnumerable<KeyValuePair<string, object>> args)
{
    var sb = new StringBuilder(name);
    if (status is not null) sb.Append(' ').Append(status);
    if (deviceId is not null) sb.Append(" DEVICEID=\"").Append(deviceId).Append('"');

    foreach (var (key, value) in args)
    {
        sb.Append(' ').Append(key).Append('=');
        sb.Append(value switch
        {
            bool b   => b ? "1" : "0",
            string s => "\"" + s + "\"",       // KEIN Escaping - siehe unten
            _        => Convert.ToString(value, CultureInfo.InvariantCulture)
        });
    }

    sb.Append(" \n");    // Leerzeichen vor dem Newline - Companion macht das auch
    Enqueue(sb.ToString());
}
```

⚠️ Das fehlende Escaping ist **absichtlich kompatibel**. Companion escaped ausgehend
nicht, Clients erwarten es entsprechend. Daraus folgt die harte Regel:

> **Jeder ausgehende String-Wert muss frei von `"` und `\n` sein.** Alles, was
> Benutzerinhalt sein kann — Button-Text, Variablenwerte, JSON, Produktnamen — wird
> base64-kodiert übertragen. Für die wenigen Felder, die roh gehen (`DEVICEID` in
> Antworten, Farbwerte), gilt: vor dem Senden validieren, nicht darauf vertrauen.

---

## 5. Fallstricke — die Liste, die wir uns sparen können

1. **5-Sekunden-Timeout.** Beide Transports trennen bei Funkstille. Unser Server muss
   den Timer bei **jedem Empfang** zurücksetzen und selbst nichts senden, um ihn zu
   halten — der Client pingt. Umgekehrt sollten wir tolerant sein: nicht sofort bei
   5,001 s kappen, sondern etwas Puffer geben.

2. **Trailing Space vor `\n`.** Companion sendet ihn, Clients sind daran gewöhnt.
   Nachbauen. Beim Empfang tolerant sein (leere Fragmente ignorieren — der Parser oben
   tut das bereits).

3. **`=` im Wert.** Am **ersten** `=` teilen, nie an allen. Base64-Padding und
   `data:`-URLs brechen sonst.

4. **`PRESSED=0` vs. `PRESSED=`.** Companion prüft erst auf Anwesenheit
   (`if (!params.PRESSED)`), dann auf Wahrheitswert. `"0"` besteht die erste Prüfung
   und wird korrekt zu `false`. Ein leerer Wert ergibt `Missing PRESSED`. Wer das mit
   einer einzigen Boolean-Prüfung nachbaut, verliert Tastendrücke beim Loslassen.

5. **Bitmap-Format.** `rgb` = nacktes Base64 roher Pixel; `png`/`webp` = vollständige
   `data:`-URL. Der Client unterscheidet am Präfix. Wer `webp` ohne `data:`-Präfix
   sendet, produziert schwarze Tasten ohne Fehlermeldung.

6. **`BRIGHTNESS` fehlend heißt „unterstützt".** Nur ein explizit falsey Wert schaltet
   die Unterstützung ab. Umgekehrte Default-Annahme ist der naheliegende Fehler.

7. **`CAN_CHANGE_PAGE` ist ein Label, kein Boolean.** Der String wird als
   Checkbox-Beschriftung in der UI verwendet.

8. **`DIRECTION=0` bedeutet −1**, nicht 0. Rückwärtskompatibilität mit der alten
   Boolean-Notation.

9. **Mehrere Controls pro Grid-Position** sind im Manifest-Modus zulässig und müssen
   je ein eigenes `KEY-STATE` bekommen. Wer nach Position statt nach Control-ID
   dedupliziert, verliert LED-Ringe und ähnliche Doppelbelegungen.

10. **Ein Client, viele Devices.** Companion Satellite meldet jedes angeschlossene
    Gerät über dieselbe Verbindung an. Die Registry muss pro Verbindung mehrere
    Devices halten, und der Abbau beim Verbindungsende muss alle erfassen.

---

## 6. Rendering: der eigentliche Aufwand

Das Protokoll transportiert **fertige Bilder**. Alles, was Companion in der
Graphics-Schicht macht, müssen wir auf der C#-Seite selbst bauen:

- Hintergrundfarbe, Text mit Umbruch, Schriftgrößen (inkl. `auto`)
- PNG-Overlays / Icons
- Zustandsdarstellung (gedrückt, Schritt-Position bei mehrstufigen Buttons)
- Anwendung von Feedback-Styles auf den Button
- Die Sperr-Darstellung für Geräte ohne `PINCODE_LOCK`
- Rotation der Surface (0/90/180/−90) vor dem Senden

Für `rgb` brauchen wir am Ende einen Buffer aus `w*h` RGB-Tripeln ohne Alpha.
`SkiaSharp` oder `ImageSharp` decken das ab; `ImageSharp` bringt PNG- und
WebP-Encoder gleich mit, was für die komprimierten Formate praktisch ist.

**Empfehlung:** Bei M3 stehenbleiben, bis das restliche Produkt steht. Farbe + Text
ohne Bitmap ist überraschend brauchbar und kostet fast nichts. Das Rendering ist ein
eigenes Teilprojekt und lässt sich sauber nachziehen.

---

## 7. Welche API-Version melden wir?

`BEGIN` enthält `ApiVersion`. Clients treffen daran ihre Feature-Entscheidungen
(Companion Satellite prüft semver-artig).

**Regel: die höchste Version melden, deren Features wir vollständig bedienen — nicht
die höchste, die es gibt.** Melden wir `1.14.0`, ohne `LAYOUT_MANIFEST` zu verstehen,
schickt ein moderner Client ein Manifest und wir scheitern.

Sinnvolle Stufen entlang unserer Meilensteine:

| Unser Stand | melden |
|---|---|
| M1–M3 (Legacy-Grid, Farbe/Text, Bitmaps) | `1.6.0` |
| \+ Transferable Values, Brightness abwählbar | `1.7.1` |
| \+ Locked-State | `1.8.0` |
| \+ Manifest-Modus | `1.9.0` |
| \+ Subscriptions, Config-Fields, Change-Page | `1.10.1` |
| \+ Bitmap-Formate | `1.12.0` |
| \+ Rotationsbeträge | `1.14.0` |

`CAPS` entsprechend ehrlich füllen: `BITMAP_FORMATS` nur mit dem, was wir wirklich
kodieren, `SUBSCRIPTIONS=0`, solange die Subscription-API fehlt.

---

## 8. Testen

**Referenzimplementierung des Clients:**
[bitfocus/companion-satellite](https://github.com/bitfocus/companion-satellite) (MIT).
Bei jeder Unklarheit dort nachsehen, wie der Client eine Nachricht tatsächlich
interpretiert — die Spec beschreibt Companions Sicht, der Client kann toleranter oder
strenger sein.

**Teststufen:**

1. **Wire-Ebene:** `nc`/`telnet` gegen unseren Port. Handshake, `PING`, Fehlerfälle.
2. **Gegen den echten Client:** Companion Satellite auf einem Rechner mit Stream Deck,
   als Ziel unsere IP. Das ist der einzige Test, der zählt.
3. **Vergleichstest gegen echtes Companion:** Eine Companion-Instanz und unseren Server
   parallel betreiben, denselben Client abwechselnd verbinden und die Byteströme
   vergleichen (`tcpdump`/Wireshark, Port 16622 ist Klartext). So finden sich
   Abweichungen im Format, die der Client stillschweigend toleriert — bis er es eines
   Tages nicht mehr tut.
4. **Regression:** Aufgezeichnete Client-Sitzungen als Fixtures gegen den Parser
   abspielen.

---

## 9. Sicherheit und Betrieb

**Das Protokoll hat keine Authentifizierung.** Wer den Port erreicht, kann Devices
anmelden und Tastendrücke auslösen. Daraus folgt:

- Bind-Adresse **konfigurierbar** machen, Default nicht `0.0.0.0`/`::`, sondern eine
  bewusste Entscheidung. Companion bindet global; wir müssen das nicht kopieren.
- Betrieb nur im vertrauenswürdigen Produktionsnetz. Für alles andere: TLS-Terminierung
  oder VPN davor. (Der WebSocket-Transport ließe sich hinter einem Reverse Proxy mit
  TLS betreiben — der TCP-Transport nicht.)
- Ressourcenlimits vom ersten Tag an: 2-MiB-Zeilenlimit übernehmen, Obergrenze für
  Devices pro Verbindung und für gleichzeitige Verbindungen, Timeout beim Verbindungsaufbau.
- Alle Zahlenparameter gegen Bereiche prüfen (`KEYS_TOTAL` ≤ 2000, `KEYS_PER_ROW` ≤ 1000
  — Companion tut das, weil pro Taste ein Objekt entsteht).
- Eingehende Base64-Payloads (`LAYOUT_MANIFEST`, `CONFIG_FIELDS`, `VARIABLES`, `STYLE`)
  größenbegrenzen und schema-validieren, bevor sie deserialisiert werden.

---

## 10. Was noch zu verifizieren ist

Diese Punkte stammen aus dem Quelltext, wurden aber **nicht** gegen eine laufende
Instanz geprüft. Vor der Implementierung mit einem echten Client gegenprüfen:

- [ ] **Byte-Reihenfolge und Zeilenanordnung des `rgb`-Buffers.** Erwartet werden
      RGB-Tripel, zeilenweise, Ursprung oben links — belegt ist nur, dass
      `drawNative(w, h, rotation, 'rgb')` einen rohen Buffer liefert. Am schnellsten
      mit einem Testbild (eine rote Ecke) gegen einen echten Stream Deck zu klären.
- [ ] **Verhalten des Clients bei fehlendem Trailing Space** — ob er tolerant ist.
- [ ] **`FONT_SIZE`**: numerischer Wert oder String `"auto"`; wie der Client mit
      unbekannten Werten umgeht.
- [ ] **WebSocket-Pfad und Subprotokoll**: im Companion-Code nicht gesetzt; welchen
      Pfad Companion Satellite tatsächlich anfragt, ist am Client zu prüfen.
- [ ] **Reconnect-Verhalten** des Clients: Intervall, ob `DEVICEID` stabil bleibt.
- [ ] **`data:`-URL-Varianten**: welche MIME-Schreibweisen der Client akzeptiert.

---

## 11. Grenzen des Ansatzes

Was über Satellite **nicht** geht — unabhängig von der Implementierungsqualität:

- Keine Konfiguration von Buttons oder Seiten durch den Client (außer `CHANGE-PAGE`)
- Keine Feedback-Werte, keine Modul- oder Verbindungsverwaltung
- Kein Zugriff auf Companions Variablen jenseits der deklarierten Transferable Values
- Der Client bestimmt sein Layout; der Server kann keine Geräte „anfordern"

Alles davon liegt in anderen Schnittstellen (Modul-API, tRPC/REST). Satellite ist die
Surface-Ebene und nichts sonst — genau deshalb ist sie so klein und stabil.

---

## 12. Startcheckliste

- [ ] `SATELLITE_PROTOCOL.md` §3 (Syntax) und §5–6 (Kommandos) gelesen
- [ ] Zielversion für `BEGIN`/`CAPS` festgelegt (§7)
- [ ] Entscheidung: nur TCP oder auch WebSocket
- [ ] Entscheidung: Legacy-Grid zuerst oder direkt Manifest-Modus
- [ ] Companion Satellite auf einem Testrechner mit echtem Gerät bereitgestellt
- [ ] Eine Companion-Instanz als Vergleichsreferenz aufgesetzt
- [ ] Bind-Adresse und Netzsegment für den Betrieb geklärt
- [ ] Server-Rolle im nächsten Bitfocus-Gespräch angesprochen
