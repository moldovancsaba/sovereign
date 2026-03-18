import AppKit
import Foundation

enum DesktopCore {
    @discardableResult
    static func runShellCapture(_ command: String, workingDirectory: String) -> String {
        let process = Process()
        let out = Pipe()
        let err = Pipe()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-lc", "cd \"\(workingDirectory)\" && \(command)"]
        process.standardOutput = out
        process.standardError = err

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return ""
        }

        let data = out.fileHandleForReading.readDataToEndOfFile()
        let errData = err.fileHandleForReading.readDataToEndOfFile()
        let stdout = String(data: data, encoding: .utf8) ?? ""
        let stderr = String(data: errData, encoding: .utf8) ?? ""
        return stdout + (stderr.isEmpty ? "" : "\n" + stderr)
    }

    static func runShellAsync(_ command: String, workingDirectory: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-lc", "cd \"\(workingDirectory)\" && \(command)"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        try? process.run()
    }

    static func portListening(_ port: Int) -> Bool {
        let output = runShellCapture(
            "/usr/sbin/lsof -t -iTCP:\(port) -sTCP:LISTEN 2>/dev/null | head -1",
            workingDirectory: "/"
        )
        return !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
