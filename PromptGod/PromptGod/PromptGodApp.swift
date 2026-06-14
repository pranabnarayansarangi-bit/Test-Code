import SwiftUI

@main
struct PromptGodApp: App {
    @StateObject private var store = PromptStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
        }
    }
}
