import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var store: PromptStore

    var body: some View {
        NavigationStack {
            Group {
                if store.favorites.isEmpty {
                    EmptyStateView(
                        icon: "star",
                        title: "Nothing saved",
                        message: "Tap the star on any prompt to keep it here."
                    )
                } else {
                    List(store.favorites) { prompt in
                        PromptCardView(prompt: prompt) {
                            store.toggleFavorite(prompt)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Saved")
        }
    }
}
