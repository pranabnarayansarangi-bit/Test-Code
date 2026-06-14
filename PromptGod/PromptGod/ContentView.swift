import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            GeneratorView()
                .tabItem { Label("Forge", systemImage: "wand.and.stars") }

            HistoryView()
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }

            FavoritesView()
                .tabItem { Label("Saved", systemImage: "star.fill") }
        }
        .tint(.purple)
    }
}

#Preview {
    ContentView()
        .environmentObject(PromptStore())
}
