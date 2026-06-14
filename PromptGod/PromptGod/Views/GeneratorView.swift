import SwiftUI

struct GeneratorView: View {
    @EnvironmentObject private var store: PromptStore

    @State private var settings = PromptSettings()
    @State private var current: GeneratedPrompt?
    @State private var showCopied = false

    private let generator = PromptGenerator()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    modePicker
                    subjectField
                    if let current {
                        resultCard(current)
                    }
                    godModeButton
                    generateButton
                    dials
                }
                .padding()
            }
            .background(backgroundGradient.ignoresSafeArea())
            .navigationTitle("Prompt God")
            .overlay(alignment: .top) {
                if showCopied {
                    Text("Copied to clipboard")
                        .font(.subheadline.bold())
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.top, 4)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }

    // MARK: - Sections

    private var modePicker: some View {
        Picker("Mode", selection: $settings.mode) {
            ForEach(PromptMode.allCases) { mode in
                Label(mode.title, systemImage: mode.systemImage).tag(mode)
            }
        }
        .pickerStyle(.segmented)
    }

    private var subjectField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SUBJECT")
                .font(.caption.bold()).foregroundStyle(.secondary)
            TextField("Leave blank for a random subject…", text: $settings.subject, axis: .vertical)
                .textFieldStyle(.plain)
                .padding(12)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                .lineLimit(1...3)
        }
    }

    private func resultCard(_ prompt: GeneratedPrompt) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(prompt.text)
                .font(.body)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 12) {
                actionButton("Copy", "doc.on.doc") { copy(prompt) }
                actionButton(prompt.isFavorite ? "Saved" : "Save",
                             prompt.isFavorite ? "star.fill" : "star") {
                    store.toggleFavorite(prompt)
                    current?.isFavorite.toggle()
                }
                ShareLink(item: prompt.text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(LinearGradient(colors: [.purple.opacity(0.35), .indigo.opacity(0.25)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        )
    }

    private var godModeButton: some View {
        Button {
            let p = generator.godMode(mode: settings.mode, subject: settings.subject)
            current = p
            store.add(p)
            Haptics.success()
        } label: {
            Label("GOD MODE", systemImage: "bolt.fill")
                .font(.headline.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    LinearGradient(colors: [.orange, .pink, .purple],
                                   startPoint: .leading, endPoint: .trailing),
                    in: RoundedRectangle(cornerRadius: 14)
                )
                .foregroundStyle(.white)
        }
    }

    private var generateButton: some View {
        Button {
            let p = generator.generate(from: settings)
            current = p
            store.add(p)
            Haptics.light()
        } label: {
            Label("Generate", systemImage: "wand.and.stars")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var dials: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("DIALS").font(.caption.bold()).foregroundStyle(.secondary)

            VStack(alignment: .leading) {
                Text("Intensity: \(intensityLabel)")
                    .font(.subheadline)
                Slider(value: Binding(
                    get: { Double(settings.intensity) },
                    set: { settings.intensity = Int($0.rounded()) }
                ), in: 0...2, step: 1)
            }

            toggle("Style", $settings.includeStyle)
            toggle("Composition", $settings.includeComposition)
            toggle("Lighting", $settings.includeLighting)
            toggle("Color", $settings.includeColor)
            toggle("Mood", $settings.includeMood)
            toggle("Camera / Lens", $settings.includeCamera)
            toggle("Detail boosters", $settings.includeDetailBoosters)

            if settings.mode == .video {
                Divider().padding(.vertical, 4)
                Text("VIDEO").font(.caption.bold()).foregroundStyle(.secondary)
                toggle("Motion", $settings.includeMotion)
                toggle("Camera movement", $settings.includeCameraMove)
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Bits

    private var intensityLabel: String {
        switch settings.intensity {
        case 0: return "Sparse"
        case 2: return "Maximalist"
        default: return "Balanced"
        }
    }

    private func toggle(_ title: String, _ binding: Binding<Bool>) -> some View {
        Toggle(title, isOn: binding).tint(.purple)
    }

    private func actionButton(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var backgroundGradient: LinearGradient {
        LinearGradient(colors: [Color.black, Color(red: 0.10, green: 0.05, blue: 0.18)],
                       startPoint: .top, endPoint: .bottom)
    }

    private func copy(_ prompt: GeneratedPrompt) {
        Clipboard.copy(prompt.text)
        Haptics.light()
        withAnimation { showCopied = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation { showCopied = false }
        }
    }
}

#Preview {
    GeneratorView().environmentObject(PromptStore())
}
