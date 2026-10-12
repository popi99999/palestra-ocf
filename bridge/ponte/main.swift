// Palestra Ponte — registra nel DB Excel Mediolanum i test fatti sulla Palestra (Mac).
// Ogni 20 s legge dall'account i test nuovi e, se il DB è aperto in Excel, aggiorna il foglio "Database"
// con le stesse regole del DB (verificate il 12/10/2026):
//   T "Quesito Affrontato": +1 per ogni risposta data ("MAI" = 0)
//   G "E2":                 +1 per ogni risposta sbagliata (numero di errori; l'"Analisi" del DB li somma)
//   S "% risp. Corrette":   è una FORMULA del DB, =SE(T="MAI";0%;(T-G)/T): non si tocca mai
//   le domande non date non contano. Ogni test si registra una sola volta (registro locale).
// Uso: PalestraPonte            (ciclo continuo, per l'avvio automatico)
//      PalestraPonte --once     (un giro solo, stampa cosa fa)
//      PalestraPonte --status   (stato)
import Foundation
import AppKit

let SUPA = "https://owxiwgfufhqxwygysgzu.supabase.co/rest/v1/rpc/load_progress2"
let KEY = "sb_publishable_scf7sDpikMUHXqGRkoQBcA_8eoxz-yt"
let DIR = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/PalestraPonte")
let MAPPA = DIR.appendingPathComponent("mappa.json") // quesito del sito -> riga del foglio Database (in Materia 2 la numerazione del DB è diversa)
let CONFIG = DIR.appendingPathComponent("config.json"), LEDGER = DIR.appendingPathComponent("registrati.json"), STATUS = DIR.appendingPathComponent("stato.json"), LOG = DIR.appendingPathComponent("ponte.log")

func log(_ s: String) {
  let line = ISO8601DateFormatter().string(from: Date()) + "  " + s + "\n"
  if let h = try? FileHandle(forWritingTo: LOG) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close() } else { try? line.write(to: LOG, atomically: true, encoding: .utf8) }
  if CommandLine.arguments.contains("--once") { print(s) }
}
func readJSON(_ u: URL) -> [String: Any] { (try? JSONSerialization.jsonObject(with: Data(contentsOf: u))) as? [String: Any] ?? [:] }
func writeJSON(_ u: URL, _ o: Any) { if let d = try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted, .sortedKeys]) { try? d.write(to: u, options: .atomic) } }

try? FileManager.default.createDirectory(at: DIR, withIntermediateDirectories: true)
var config = readJSON(CONFIG)
guard let code = config["code"] as? String, !code.isEmpty else { print("Manca il codice dell'account in \(CONFIG.path)"); exit(1) }
// dal momento dell'installazione: i test di prima restano solo nella Palestra (si possono importare con "since": 0)
let since = (config["since"] as? Double) ?? Date().timeIntervalSince1970 * 1000
let DRY = CommandLine.arguments.contains("--dry")          // prova: mostra cosa scriverebbe, senza toccare il DB
let ONLY: String? = CommandLine.arguments.firstIndex(of: "--only").flatMap { $0 + 1 < CommandLine.arguments.count ? CommandLine.arguments[$0 + 1] : nil } // solo il test con questa chiave
if config["since"] == nil { config["since"] = since; writeJSON(CONFIG, config) }

// --- account: test con il dettaglio delle risposte
func loadSessions() -> [[String: Any]]? {
  var req = URLRequest(url: URL(string: SUPA)!, timeoutInterval: 15)
  req.httpMethod = "POST"; req.setValue(KEY, forHTTPHeaderField: "apikey"); req.setValue("application/json", forHTTPHeaderField: "Content-Type")
  req.httpBody = try? JSONSerialization.data(withJSONObject: ["p_code": code])
  let sem = DispatchSemaphore(value: 0); var out: [[String: Any]]? = nil
  URLSession.shared.dataTask(with: req) { d, r, e in
    defer { sem.signal() }
    guard let d = d, (r as? HTTPURLResponse)?.statusCode == 200, let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let data = j["data"] as? [String: Any] else { return }
    out = (data["h"] as? [[String: Any]]) ?? []
  }.resume()
  _ = sem.wait(timeout: .now() + 20)
  return out
}
func skey(_ h: [String: Any]) -> String { (h["id"] as? String) ?? "\((h["t"] as? NSNumber)?.int64Value ?? 0)|\(h["k"] as? String ?? "")" }

// --- Excel via AppleScript (permesso "Automazione" per Microsoft Excel)
var lastASError: String? = nil
func runAS(_ src: String) -> (String?, String?) {
  var err: NSDictionary?
  guard let s = NSAppleScript(source: src) else { return (nil, "script") }
  let r = s.executeAndReturnError(&err)
  if let e = err { lastASError = (e[NSAppleScript.errorMessage] as? String) ?? "\(e)"; return (nil, lastASError) }
  return (r.stringValue ?? "", nil)
}
func dbWorkbook() -> String? {
  guard !NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.Excel").isEmpty else { return nil }
  let (r, _) = runAS("""
  with timeout of 10 seconds
    tell application "Microsoft Excel"
      set AppleScript's text item delimiters to linefeed
      return (name of every workbook) as text
    end tell
  end timeout
  """)
  if r == nil { log("Excel non risponde allo script: \(String(describing: lastASError))") }
  return (r ?? "").split(separator: "\n").map(String.init).first { $0.hasPrefix("DB OCF") }
}
func esc(_ s: String) -> String { s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") }
func num(_ s: String) -> Double? { Double(s.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)) }

// legge A, G, S, T delle righe; ritorna [riga: (n, g, s, t)]
func readRows(_ wb: String, _ rows: [Int]) -> [Int: (Int, Double, Double, Double)]? {
  let list = rows.map(String.init).joined(separator: ", ")
  let (r, e) = runAS("""
  with timeout of 30 seconds
    tell application "Microsoft Excel"
      set ws to worksheet "Database" of workbook "\(esc(wb))"
      set out to ""
      repeat with i in {\(list)}
        set out to out & i & "|" & (value of cell ("A" & i) of ws as text) & "|" & (value of cell ("G" & i) of ws as text) & "|" & (value of cell ("S" & i) of ws as text) & "|" & (value of cell ("T" & i) of ws as text) & linefeed
      end repeat
      return out
    end tell
  end timeout
  """)
  guard let txt = r else { log("lettura DB non riuscita: \(e ?? "")"); return nil }
  var o: [Int: (Int, Double, Double, Double)] = [:]
  for line in txt.split(separator: "\n") {
    let p = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
    guard p.count == 5, let row = Int(p[0]) else { continue }
    o[row] = (Int(num(p[1]) ?? 0), num(p[2]) ?? 0, num(p[3]) ?? 0, num(p[4]) ?? 0) // "MAI" -> 0
  }
  return o
}
func writeRows(_ wb: String, _ upd: [(row: Int, g: Double, t: Double)]) -> Bool {
  // solo valori semplici in T e G; prima di scrivere si controlla che non contengano formule
  var lines: [String] = []
  for u in upd {
    lines.append("if (formula of cell \"T\(u.row)\" of ws) starts with \"=\" or (formula of cell \"G\(u.row)\" of ws) starts with \"=\" then error \"formula in riga \(u.row)\"")
    lines.append("set value of cell \"T\(u.row)\" of ws to \(Int(u.t))")
    if u.g > 0 { lines.append("set value of cell \"G\(u.row)\" of ws to \(Int(u.g))") }
  }
  let (_, e) = runAS("""
  with timeout of 60 seconds
    tell application "Microsoft Excel"
      set ws to worksheet "Database" of workbook "\(esc(wb))"
      \(lines.joined(separator: "\n      "))
    end tell
  end timeout
  """)
  if let e = e { log("scrittura DB non riuscita: \(e)"); return false }
  return true
}
func saveWorkbook(_ wb: String) {
  let (_, e) = runAS("with timeout of 120 seconds\n tell application \"Microsoft Excel\" to save workbook \"\(esc(wb))\"\nend timeout")
  if let e = e { log("salvataggio non riuscito: \(e)") }
}
func notify(_ s: String) {
  // tramite osascript: le notifiche di un programma in background senza finestra a volte il Mac non le mostra
  let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
  p.arguments = ["-e", "display notification \"\(esc(s))\" with title \"Palestra → DB Mediolanum\" sound name \"Glass\""]
  try? p.run(); p.waitUntilExit()
}

// --- un giro
func cycle() {
  var ledger = readJSON(LEDGER), done = Set((ledger["keys"] as? [String]) ?? [])
  var status: [String: Any] = readJSON(STATUS); status["lastRun"] = Date().timeIntervalSince1970 * 1000
  defer { writeJSON(STATUS, status) }
  guard let sessions = loadSessions() else { status["state"] = "account non raggiungibile"; log("account non raggiungibile"); return }
  let todo = sessions.filter { h in
    guard let q = h["q"] as? [[Any]], !q.isEmpty, let t = (h["t"] as? NSNumber)?.doubleValue, t >= since else { return false }
    if let o = ONLY { return skey(h) == o && !done.contains(o) }
    return !done.contains(skey(h))
  }.sorted { (($0["t"] as? NSNumber)?.doubleValue ?? 0) < (($1["t"] as? NSNumber)?.doubleValue ?? 0) }
  status["pending"] = todo.count
  if todo.isEmpty { status["state"] = "tutto registrato"; return }
  if DRY { log("[prova] \(todo.count) test da registrare") }
  guard let wb = dbWorkbook() else { status["state"] = "in attesa: apri il DB in Excel (\(todo.count) test da registrare)"; log("DB non aperto, \(todo.count) test in attesa"); return }
  var recordedNow: [[String: Any]] = []
  for h in todo {
    let q = (h["q"] as? [[Any]]) ?? []
    // risposte date: esito 1 giusta, -1 sbagliata, -2 "non la so" (conta sbagliata); 0 non data: non conta
    var items: [(n: Int, ok: Bool)] = []
    for it in q { guard it.count >= 2, let n = (it[0] as? NSNumber)?.intValue, let e = (it[1] as? NSNumber)?.intValue, n >= 1, n <= 5000, e != 0 else { continue }; items.append((n, e == 1)) }
    if items.isEmpty { done.insert(skey(h)); continue }
    let mappa = readJSON(MAPPA)
    let rowOf: (Int) -> Int? = { n in mappa.isEmpty ? n + 1 : (mappa[String(n)] as? NSNumber)?.intValue }
    let skipped = items.filter { rowOf($0.n) == nil }.map { $0.n }
    if !skipped.isEmpty { log("quesiti senza corrispondenza sicura nel DB, saltati: \(skipped)") }
    items = items.filter { rowOf($0.n) != nil }
    let rows = Array(Set(items.map { rowOf($0.n)! })).sorted()
    guard let cur = readRows(wb, rows) else { status["state"] = "errore di lettura del DB"; return }
    var acc: [Int: (g: Double, t: Double)] = [:]
    var bad = false
    for it in items {
      let row = rowOf(it.n)!
      guard let c = cur[row], c.0 == row - 1 else { log("riga \(row) del DB non è quella attesa per il quesito \(it.n): salto il test"); bad = true; break }
      let prev = acc[row] ?? (g: c.1, t: c.3)
      acc[row] = (g: prev.g + (it.ok ? 0 : 1), t: prev.t + 1)
    }
    if bad { status["state"] = "il DB non corrisponde alla banca dati della Palestra"; return }
    let upd = acc.map { (row: $0.key, g: $0.value.g, t: $0.value.t) }.sorted { $0.row < $1.row }
    if DRY {
      for u in upd { let c = cur[u.row]!; log("  [prova] quesito \(u.row - 1): T \(Int(c.3)) -> \(Int(u.t)), E2 \(Int(c.1)) -> \(Int(u.g)), % giuste -> \(Int(((u.t - u.g) / u.t * 100).rounded()))%") }
      log("[prova] «\(h["title"] as? String ?? "")» chiave \(skey(h)): \(items.count) risposte"); continue
    }
    guard writeRows(wb, upd) else { status["state"] = "errore di scrittura nel DB"; return }
    done.insert(skey(h))
    ledger["keys"] = Array(done); writeJSON(LEDGER, ledger) // subito: mai due volte lo stesso test
    let ok = items.filter { $0.ok }.count
    recordedNow.append(["key": skey(h), "title": h["title"] as? String ?? "", "n": items.count, "ok": ok, "at": Date().timeIntervalSince1970 * 1000])
    log("registrato «\(h["title"] as? String ?? "")»: \(items.count) risposte, \(ok) giuste")
  }
  if DRY { return }
  if !recordedNow.isEmpty {
    saveWorkbook(wb)
    var hist = (status["recorded"] as? [[String: Any]]) ?? []; hist = Array((hist + recordedNow).suffix(50)); status["recorded"] = hist
    let tot = recordedNow.reduce(0) { $0 + ($1["n"] as? Int ?? 0) }
    notify(recordedNow.count == 1 ? "Test registrato nel DB: \(tot) risposte" : "\(recordedNow.count) test registrati nel DB: \(tot) risposte")
  }
  status["state"] = "tutto registrato"; status["pending"] = 0
}

if CommandLine.arguments.contains("--status") { print(String(data: (try? Data(contentsOf: STATUS)) ?? Data(), encoding: .utf8) ?? "{}"); exit(0) }
log("avvio (registro dei test dal \(Date(timeIntervalSince1970: since / 1000)))")
if CommandLine.arguments.contains("--once") { cycle(); exit(0) }
// all'avvio si chiede subito a Excel quali file sono aperti: così il Mac mostra adesso la richiesta di permesso
if let wb = dbWorkbook() { log("DB trovato: \(wb)") } else { log("all'avvio il DB non è aperto (o manca il permesso Automazione per Excel): \(lastASError ?? "-")") }
while true { autoreleasepool { cycle() }; Thread.sleep(forTimeInterval: 20) }
