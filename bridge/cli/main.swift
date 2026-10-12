// dbctl — prova a mano del ponte: dbctl state | press <descr> | answer <testo> | combo <n> <testo> | type <campo> <testo> | quizlist | start <materia> <contenuto> <ordine> <n> | goto <i> | finish
import Foundation

func out(_ o: [String: Any]) { let d = try! JSONSerialization.data(withJSONObject: o); print(String(data: d, encoding: .utf8)!) }
let a = Array(CommandLine.arguments.dropFirst())
do {
  switch a.first ?? "" {
  case "state": out(state())
  case "press": out(["ok": press(a[1])])
  case "answer": out(try answer(a[1]))
  case "combo": out(["ok": true, "shown": try chooseCombo(Int(a[1])!, a[2])])
  case "type": try typeField(a[1], a[2]); out(["ok": true])
  case "quizlist": out(["ok": true, "ids": try quizList()])
  case "start": out(try startQuiz(materia: a[1], contenuto: a[2], ordine: a[3], n: Int(a[4])!))
  case "goto": out(["ok": goTo(Int(a[1])!)])
  case "finish": out(finishQuiz())
  default: out(["ok": false, "error": "comando sconosciuto"])
  }
} catch let e as DBError { out(["ok": false, "error": e.msg]) } catch { out(["ok": false, "error": "\(error)"]) }
