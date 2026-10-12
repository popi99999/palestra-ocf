// core.swift — comanda la finestra "Quiz OCF" del DB Excel Mediolanum (Mac, permesso Accessibilità).
// Usato dal programma di prova (cli/main.swift) e dal ponte (server/main.swift).
import Foundation
import AppKit
import ApplicationServices

let WIN = "Quiz OCF - MCU Banca Mediolanum"
struct DBError: Error { let msg: String }

var excelApp: NSRunningApplication? { NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.Excel").first }
var axApp: AXUIElement? { guard let e = excelApp else { return nil }; let a = AXUIElementCreateApplication(e.processIdentifier); AXUIElementSetMessagingTimeout(a, 3); return a }

func attr(_ e: AXUIElement, _ a: String) -> AnyObject? { var v: AnyObject?; return AXUIElementCopyAttributeValue(e, a as CFString, &v) == .success ? v : nil }
func str(_ e: AXUIElement, _ a: String) -> String { (attr(e, a) as? String) ?? "" }
func role(_ e: AXUIElement) -> String { str(e, kAXRoleAttribute) }
func desc(_ e: AXUIElement) -> String { str(e, kAXDescriptionAttribute) }
func title(_ e: AXUIElement) -> String { str(e, kAXTitleAttribute) }
func value(_ e: AXUIElement) -> String { if let v = attr(e, kAXValueAttribute) { if let s = v as? String { return s }; if let n = v as? NSNumber { return n.stringValue } }; return "" }
func frame(_ e: AXUIElement) -> CGRect {
  var p = CGPoint.zero, s = CGSize.zero
  if let v = attr(e, kAXPositionAttribute) { AXValueGetValue(v as! AXValue, .cgPoint, &p) }
  if let v = attr(e, kAXSizeAttribute) { AXValueGetValue(v as! AXValue, .cgSize, &s) }
  return CGRect(origin: p, size: s)
}
func children(_ e: AXUIElement) -> [AXUIElement] { (attr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] }
func all(_ e: AXUIElement, _ depth: Int = 0) -> [AXUIElement] { depth > 12 ? [] : children(e).flatMap { [$0] + all($0, depth + 1) } }
func windows() -> [AXUIElement] { guard let a = axApp else { return [] }; return (attr(a, kAXWindowsAttribute) as? [AXUIElement]) ?? [] }
func quizWindow() -> AXUIElement? { windows().first { title($0) == WIN } }
func norm(_ s: String) -> String { s.replacingOccurrences(of: "’", with: "'").replacingOccurrences(of: "‘", with: "'").components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ").lowercased() }
func ms(_ n: Int) { usleep(useconds_t(n * 1000)) }

// --- clic e tasti reali: Excel davanti per un attimo, poi si rimette tutto com'era (app davanti e puntatore)
func withExcelFront(_ body: () -> Void) {
  guard let ex = excelApp else { return }
  let front = NSWorkspace.shared.frontmostApplication
  let mouse = CGEvent(source: nil)?.location ?? .zero
  if front?.bundleIdentifier != "com.microsoft.Excel" {
    ex.activate(options: [])
    var t = 0; while NSWorkspace.shared.frontmostApplication?.bundleIdentifier != "com.microsoft.Excel" && t < 60 { ms(10); t += 1 }
    ms(180) // Excel deve essere davvero pronto a ricevere il clic
  }
  body()
  CGWarpMouseCursorPosition(mouse)
  if let f = front, f.bundleIdentifier != "com.microsoft.Excel" { f.activate(options: []) }
}
func hidClick(_ p: CGPoint) {
  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  ms(25)
  for t in [CGEventType.leftMouseDown, .leftMouseUp] {
    let e = CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)!
    e.flags = []; e.setIntegerValueField(.mouseEventClickState, value: 1); e.post(tap: .cghidEventTap); ms(25)
  }
}
func hidKey(_ code: CGKeyCode) {
  // tasti senza modificatori; i flag si azzerano esplicitamente così nessun Cmd/Opzione resta "premuto"
  for down in [true, false] { let e = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)!; e.flags = []; e.post(tap: .cghidEventTap); ms(15) }
}
func hidType(_ s: String) {
  for ch in s.utf16 { for down in [true, false] { let e = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down)!; var c = ch; e.keyboardSetUnicodeString(stringLength: 1, unicodeString: &c); e.post(tap: .cghidEventTap); ms(12) } }
}

// --- stato della finestra del quiz
func state() -> [String: Any] {
  guard excelApp != nil else { return ["ok": true, "excel": false, "window": false, "page": "none"] }
  guard let w = quizWindow() else { return ["ok": true, "excel": true, "window": false, "page": "none", "hint": "Apri il DB e la finestra Start Quiz, sulla stessa scrivania del sito (non a schermo intero)"] }
  let es = all(w)
  var o: [String: Any] = ["ok": true, "excel": true, "window": true]
  let texts = es.filter { role($0) == kAXStaticTextRole as String }
  let buttons = es.filter { role($0) == kAXButtonRole as String }.map { desc($0) }.filter { !$0.isEmpty }
  o["buttons"] = buttons
  if let d = texts.map({ desc($0) }).first(where: { $0.hasPrefix("Domanda nr.") }) {
    o["page"] = "quiz"
    let nums = d.components(separatedBy: CharacterSet.decimalDigits.inverted).compactMap { Int($0) }
    if nums.count >= 2 { o["idx"] = nums[0]; o["tot"] = nums[1] }
    if let q = texts.map({ desc($0) }).first(where: { $0.hasPrefix("Quesito nr.") }) { o["quesito"] = Int(q.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()) ?? 0 }
    o["score"] = es.filter { role($0) == kAXTextFieldRole as String }.map { value($0) }.first { $0.contains(" su ") } ?? ""
    o["alts"] = altElems(w).map { a -> [String: Any] in let f = frame(a); return ["t": desc(a), "x": f.minX, "y": f.minY] }
  } else if buttons.contains("GENERA QUIZ") {
    o["page"] = "config"
    o["limit"] = texts.map { desc($0) }.first { $0.hasPrefix("LIMITA") } ?? ""
    o["combos"] = combos(w).map { value($0) }
    o["order"] = es.filter { role($0) == kAXRadioButtonRole as String && ORDERS.values.contains(desc($0)) }.first { value($0) == "1" }.map { desc($0) } ?? ""
  } else if buttons.contains(where: { $0.hasPrefix("ESPORTA REPORT") }) || texts.contains(where: { desc($0).contains("COMPLETATO") }) {
    o["page"] = "esito"
    o["result"] = texts.map { desc($0) }.first { $0.lowercased().contains("corrette") } ?? ""
  } else { o["page"] = "other" }
  o["dialog"] = dialogButtons().map { title($0) }
  return o
}
func altElems(_ w: AXUIElement) -> [AXUIElement] {
  all(w).filter { let f = frame($0); return role($0) == kAXStaticTextRole as String && f.minX > 150 && f.minY > 120 && f.minY < 430 && !desc($0).hasPrefix("Domanda") }
    .sorted { frame($0).minY < frame($1).minY }
}
func combos(_ w: AXUIElement) -> [AXUIElement] { all(w).filter { role($0) == kAXComboBoxRole as String }.sorted { frame($0).minY < frame($1).minY } }
func dialogButtons() -> [AXUIElement] { windows().filter { title($0) != WIN && !title($0).hasPrefix("DB OCF") }.flatMap { all($0) }.filter { role($0) == kAXButtonRole as String && !title($0).isEmpty } }

let ORDERS = ["rand": "Casuale", "err": "Prima gli Errori", "less": "Prima i quesiti meno proposti", "orig": "Ordine Originale"]

// preme pulsanti, schede e opzioni (mai i testi delle risposte)
func press(_ d: String) -> Bool {
  guard let w = quizWindow() else { return false }
  for e in all(w) where [kAXButtonRole as String, kAXRadioButtonRole as String].contains(role(e)) && (desc(e) == d || title(e) == d) {
    if AXUIElementPerformAction(e, kAXPressAction as CFString) == .success { return true }
  }
  return false
}
func waitFor(_ ms_: Int, _ cond: () -> Bool) -> Bool { var t = 0; while t < ms_ { if cond() { return true }; ms(100); t += 100 }; return cond() }
func page() -> String { (state()["page"] as? String) ?? "none" }

func answered() -> Int { let sc = (state()["score"] as? String) ?? ""; return Int(sc.components(separatedBy: " su ").last ?? "") ?? -1 }
func answer(_ text: String) throws -> [String: Any] {
  guard let w = quizWindow() else { throw DBError(msg: "niente quiz aperto") }
  let want = norm(text), alts = altElems(w)
  guard let a = alts.first(where: { norm(desc($0)) == want }) ?? alts.first(where: { let d = norm(desc($0)); return d.count > 8 && (d.hasPrefix(want) || want.hasPrefix(d)) }) else { throw DBError(msg: "risposta non trovata nel DB") }
  let f = frame(a), p = CGPoint(x: f.minX + 30, y: f.minY + min(f.height / 2, 10))
  let before = answered(); var after = before
  withExcelFront {
    for _ in 0..<2 { hidClick(p); ms(220); after = answered(); if after != before { break } }
  }
  return ["ok": after != before, "clicked": desc(a), "score": (state()["score"] as? String) ?? ""]
}
func chooseCombo(_ n: Int, _ text: String) throws -> String {
  guard let w = quizWindow() else { throw DBError(msg: "finestra del quiz non trovata") }
  let cs = combos(w)
  guard n >= 1 && n <= cs.count else { throw DBError(msg: "menu \(n) non trovato") }
  let want = norm(text)
  if norm(value(cs[n - 1])) == want { return value(cs[n - 1]) }
  let f = frame(cs[n - 1])
  let label = { (r: AXUIElement) -> String in value(r).isEmpty ? desc(r) : value(r) }
  // righe della tendina aperta: testi sotto il menu, allineati al menu (le etichette del modulo stanno a sinistra)
  func rows() -> [AXUIElement] { windows().flatMap { all($0) }.filter { let fr = frame($0); return role($0) == kAXStaticTextRole as String && fr.minY >= f.maxY - 2 && fr.minX >= f.minX - 4 && fr.minX < f.maxX && fr.height < 40 && !label($0).isEmpty } }
  func match(_ rs: [AXUIElement]) -> AXUIElement? {
    rs.first(where: { norm(label($0)) == want }) ?? rs.first(where: { !want.isEmpty && norm(label($0)).hasPrefix(want) }) ?? rs.first(where: { let l = norm(label($0)); return l.count > 6 && want.hasPrefix(l) })
  }
  var done = false
  withExcelFront {
    for _ in 0..<4 where !done {
      if rows().isEmpty { hidClick(CGPoint(x: f.maxX - 8, y: f.midY)); _ = waitFor(900) { !rows().isEmpty } }
      let rs = rows(); if rs.isEmpty { ms(200); continue }
      if let r = match(rs) { let rf = frame(r); hidClick(CGPoint(x: rf.minX + 12, y: rf.midY)); done = true; break }
      // voce non visibile: si scorre la lista verso il basso e si riguarda
      let lf = rs.map { frame($0) }.reduce(rs.map { frame($0) }[0]) { $0.union($1) }
      for _ in 0..<12 where !done {
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: lf.midX, y: lf.midY), mouseButton: .left)?.post(tap: .cghidEventTap)
        CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: -3, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
        ms(180)
        if let r = match(rows()) { let rf = frame(r); hidClick(CGPoint(x: rf.minX + 12, y: rf.midY)); done = true }
      }
      if !done { hidKey(53); ms(250) }
    }
    ms(300)
  }
  let now = combos(w)
  let shown = n - 1 < now.count ? value(now[n - 1]) : ""
  guard norm(shown) == want || (!want.isEmpty && norm(shown).hasPrefix(want)) || (!norm(shown).isEmpty && want.hasPrefix(norm(shown))) else { throw DBError(msg: "nel menu \(n) non trovo «\(text)»") }
  return shown
}
func typeField(_ prefix: String, _ text: String) throws {
  guard let w = quizWindow(), let field = all(w).first(where: { role($0) == kAXTextFieldRole as String && desc($0).hasPrefix(prefix) }) else { throw DBError(msg: "campo \(prefix) non trovato") }
  let f = frame(field)
  // niente Cmd+A (lasciava il Cmd "premuto" e rovinava i clic dopo): fine riga e cancellazione a mano
  withExcelFront { hidClick(CGPoint(x: f.maxX - 6, y: f.midY)); ms(120); hidKey(119); for _ in 0..<8 { hidKey(51) }; hidType(text); hidKey(48); ms(200) }
  if value(field) != text { throw DBError(msg: "il campo \(prefix) non ha preso il valore") }
}
func quizList() throws -> [Int] {
  let script = "tell application \"Microsoft Excel\" to get value of range \"A2:A6001\" of worksheet \"QUIZ\" of active workbook"
  var err: NSDictionary?
  guard let r = NSAppleScript(source: script)?.executeAndReturnError(&err) else { throw DBError(msg: "non riesco a leggere il foglio QUIZ (permesso Automazione per Excel?)") }
  var nums: [Int] = []
  if r.numberOfItems > 0 { for i in 1...r.numberOfItems { let row = r.atIndex(i); let v = (row?.numberOfItems ?? 0) > 0 ? row?.atIndex(1) : row; let d = v?.doubleValue ?? 0; if d >= 1 { nums.append(Int(d)) } else { break } } }
  return nums
}

// --- operazioni complete usate dal sito
func startQuiz(materia: String, contenuto: String, ordine: String, n: Int) throws -> [String: Any] {
  guard quizWindow() != nil else { throw DBError(msg: "Apri il DB e la finestra Start Quiz in Excel, sulla stessa scrivania del sito") }
  var p = page()
  if p == "quiz" { _ = finishQuiz() ; p = page() }
  if p != "config" { _ = press("Configurazione QUIZ"); _ = waitFor(2000) { page() == "config" } }
  guard page() == "config" else { throw DBError(msg: "non riesco ad aprire la configurazione del quiz") }
  _ = try chooseCombo(1, materia)
  _ = waitFor(1500) { (quizWindow().map { combos($0).count } ?? 0) >= 2 }
  _ = try chooseCombo(2, contenuto)
  if let o = ORDERS[ordine] { _ = press(o) }
  try typeField("LIMITA", String(n))
  guard press("GENERA QUIZ") else { throw DBError(msg: "pulsante Genera quiz non trovato") }
  guard waitFor(15000, { page() == "quiz" }) else { throw DBError(msg: "il DB non ha generato il quiz") }
  let ids = try quizList()
  let st = state()
  return ["ok": true, "ids": Array(ids.prefix((st["tot"] as? Int) ?? ids.count)), "tot": st["tot"] ?? 0, "quesito": st["quesito"] ?? 0]
}
// porta il DB sulla domanda numero idx (1 = prima)
func goTo(_ idx: Int) -> Bool {
  for _ in 0..<400 {
    guard let cur = state()["idx"] as? Int else { return false }
    if cur == idx { return true }
    if !press(cur < idx ? "PROSSIMO QUESITO" : "QUESITO PRECEDENTE") { return false }
    _ = waitFor(1500) { (state()["idx"] as? Int) != cur }
  }
  return false
}
func answerAt(idx: Int, quesito: Int, text: String?) throws -> [String: Any] {
  guard page() == "quiz" else { throw DBError(msg: "nel DB non c'è un quiz in corso") }
  guard goTo(idx) else { throw DBError(msg: "non riesco ad arrivare alla domanda \(idx)") }
  if let q = state()["quesito"] as? Int, q != quesito { throw DBError(msg: "nel DB la domanda \(idx) è il quesito \(q), non \(quesito)") }
  guard let t = text, !t.isEmpty else { return ["ok": true, "skipped": true] } // non data / "non la so": nel DB resta senza risposta
  return try answer(t)
}
func finishQuiz() -> [String: Any] {
  if page() == "quiz" {
    _ = press("TERMINA TEST")
    // la conferma "Vuoi terminare il test in anticipo?" arriva dopo qualche istante (se mancano risposte)
    _ = waitFor(4000) { !dialogButtons().isEmpty || page() == "esito" }
    if let yes = dialogButtons().first(where: { title($0) == "Sì" }) { AXUIElementPerformAction(yes, kAXPressAction as CFString); }
    _ = waitFor(8000) { page() == "esito" }
  }
  let st = state()
  return ["ok": st["page"] as? String == "esito", "result": st["result"] ?? ""]
}
