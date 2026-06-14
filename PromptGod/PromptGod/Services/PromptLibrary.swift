import Foundation

/// Curated word banks the generator draws from. Purely descriptive / artistic
/// vocabulary — everything lives on-device, nothing is fetched or filtered.
enum PromptLibrary {

    static let subjects = [
        "a lone wanderer", "an ancient dragon", "a neon-lit street samurai",
        "a serene mountain lake", "a derelict space station", "a blooming cherry orchard",
        "a towering cyberpunk metropolis", "a mythical phoenix", "a quiet seaside village",
        "a robot tending a garden", "a witch's candlelit study", "a vast desert caravan",
        "a glass cathedral in the clouds", "an underwater coral palace", "a snow-bound wolf pack",
        "a clockwork automaton", "a floating island chain", "a midnight jazz club"
    ]

    static let styles = [
        "cinematic concept art", "studio photography", "oil painting", "watercolor illustration",
        "anime key visual", "3D render, octane", "matte painting", "ukiyo-e woodblock print",
        "low-poly art", "art nouveau poster", "vaporwave aesthetic", "gritty realism",
        "children's storybook illustration", "charcoal sketch", "isometric diorama",
        "hyperrealism", "impressionist brushwork", "retro pulp comic"
    ]

    static let lighting = [
        "golden hour light", "dramatic rim lighting", "soft diffused light", "moody chiaroscuro",
        "volumetric god rays", "neon glow", "candlelight", "overcast soft shadows",
        "harsh midday sun", "bioluminescent glow", "backlit silhouette", "cool blue moonlight",
        "warm tungsten interior light", "split lighting", "iridescent reflections"
    ]

    static let composition = [
        "rule of thirds", "centered symmetrical composition", "extreme close-up",
        "wide establishing shot", "low angle hero shot", "bird's-eye view", "dutch angle",
        "leading lines", "shallow depth of field", "deep focus", "negative space",
        "over-the-shoulder framing", "macro detail", "fisheye perspective"
    ]

    static let colors = [
        "muted earth tones", "vibrant complementary palette", "monochrome", "pastel palette",
        "high-contrast black and white", "teal and orange grade", "rich jewel tones",
        "desaturated film look", "warm autumnal hues", "cold steel blues",
        "neon pink and cyan", "sepia tones", "duotone"
    ]

    static let moods = [
        "serene and contemplative", "ominous and foreboding", "whimsical and playful",
        "epic and awe-inspiring", "melancholic", "dreamlike and surreal", "tense and dramatic",
        "cozy and intimate", "mysterious", "triumphant", "nostalgic", "ethereal"
    ]

    static let cameras = [
        "shot on 35mm film", "shot on Hasselblad", "85mm portrait lens", "24mm wide lens",
        "anamorphic lens flare", "tilt-shift", "shot on RED camera", "vintage film grain",
        "shallow f/1.4 bokeh", "long exposure", "drone aerial", "GoPro fisheye"
    ]

    static let detailBoosters = [
        "highly detailed", "intricate textures", "8k", "ultra sharp focus", "photorealistic",
        "award-winning", "masterpiece", "trending on artstation", "cinematic color grading",
        "physically based rendering", "subsurface scattering", "ray traced reflections",
        "fine surface detail", "professional composition"
    ]

    // MARK: - Video-specific

    static let motion = [
        "leaves drifting in the wind", "gentle ripples across the water", "flickering flames",
        "rain streaking down", "fabric billowing in slow motion", "crowds bustling past",
        "embers floating upward", "fog rolling in", "hair flowing in the breeze",
        "neon signs flickering", "snow falling softly", "waves crashing rhythmically"
    ]

    static let cameraMoves = [
        "slow dolly in", "smooth tracking shot", "sweeping crane shot", "orbiting 360° around the subject",
        "handheld follow", "slow push-in", "pull-back reveal", "whip pan", "drone fly-through",
        "static locked-off shot", "gentle pan left to right", "rack focus pull"
    ]

    static let pacing = [
        "slow-motion 120fps", "real-time", "timelapse", "hyperlapse", "smooth 24fps cinematic"
    ]

    static let durations = ["3 seconds", "5 seconds", "8 seconds", "10 seconds"]
}
