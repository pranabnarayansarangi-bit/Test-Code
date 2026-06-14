import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var store: PromptStore
    @State private var showClearConfirm = false

    var body: some View {
        NavigationStack {
            Group {
                if store.history.isEmpty {
                    EmptyStateView(
                        icon: "clock.arrow.circlepath",
                        title: "No prompts yet",
                        message: "Forge a prompt and it'll show up here."
                    )
                } else {
                    List {
                        ForEach(store.history) { prompt in
                            PromptCardView(prompt: prompt) {
                                store.toggleFavorite(prompt)
                            }
                        }
                        .onDelete(perform: delete)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("History")
            .toolbar {
                if !store.history.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Clear", role: .destructive) { showClearConfirm = true }
                    }
                }
            }
            .confirmationDialog("Clear all history?", isPresented: $showClearConfirm, titleVisibility: .visible) {
                Button("Clear everything", role: .destructive) { store.clearAll() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func delete(at offsets: IndexSet) {
        offsets.map { store.history[$0] }.forEach(store.delete)
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(.purple)
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}
