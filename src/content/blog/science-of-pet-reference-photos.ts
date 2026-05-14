import type { BlogPost } from "./index";

export const post: BlogPost = {
  slug: "science-of-pet-reference-photos",
  title: "How to take great pet reference photos for AI illustrations",
  excerpt:
    "How to take pet reference photos that make AI illustrations actually look like your dog or cat — lighting, angle, pose variety, what to avoid.",
  metaDescription:
    "How to take pet reference photos that make AI illustrations actually look like your dog or cat — lighting, angles, pose variety, common mistakes.",
  keywords: [
    "pet reference photos",
    "AI pet illustrations",
    "AI pet portrait",
    "reference photos for AI",
    "pet photography for AI",
  ],
  publishedAt: "2026-04-14",
  readMinutes: 6,
  author: "The StoryInk Team",
  body: [
    {
      type: "paragraph",
      content:
        "If you only do one thing carefully in the StoryInk flow, do this. The reference photos are the single largest variable in whether the illustrations look like your pet. Better photos in, better book out. [The prompt matters too](/blog/how-to-write-a-great-prompt), the mode matters too, but neither of them can compensate for blurry low-light selfies as the reference set.",
    },
    {
      type: "paragraph",
      content:
        "We have looked at a lot of AI illustrations from pet photos by now and the patterns are pretty consistent. This post is the short version of what actually moves the needle.",
    },
    {
      type: "heading",
      content: "Natural light: the biggest factor in pet reference photos",
    },
    {
      type: "paragraph",
      content:
        "The single biggest factor. Outdoor daylight on an overcast day is ideal — even, soft, no harsh shadows. Sunny but shaded is the next best. Direct midday sun is usable but it bleaches fur color and blows out highlights, which can confuse the AI about the actual coat.",
    },
    {
      type: "paragraph",
      content:
        "Indoor photos taken next to a large window are fine. Indoor photos taken with overhead lights or, worst, with your phone's flash, are not. The flash flattens the face and reflects in the eyes and the AI tends to render the pet in an oddly metallic way. Skip flash entirely.",
    },
    {
      type: "heading",
      content: "Eye level",
    },
    {
      type: "paragraph",
      content:
        "Phone-looking-down-at-the-dog is the default human pose. It is also the worst angle for a reference photo. The head looks oversized, the body foreshortens, the perspective is wrong. The AI absorbs that distortion and bakes it in.",
    },
    {
      type: "paragraph",
      content:
        "Get down to the pet's eye level. Sit on the floor. Crouch. Lie on your stomach if you have to. The reference photo should look like the dog is looking at another dog. That is the perspective that produces an illustration that looks like the dog.",
    },
    {
      type: "heading",
      content: "Multiple angles",
    },
    {
      type: "paragraph",
      content:
        "One angle per upload, ideally three to five photos total covering different angles. The combinations that work well:",
    },
    {
      type: "list",
      content: [
        "One clean front-on portrait, head and shoulders, eyes visible.",
        "One full body in profile (side view, standing or sitting).",
        "One three-quarter angle of the face.",
        "One from above showing the back markings if the coat has any.",
        "One in an active pose if you have it (running, mid-jump, mid-play).",
      ],
    },
    {
      type: "paragraph",
      content:
        "You do not need all five. Three good ones beat five mediocre ones. The system uses the references collectively to build up a picture of what the animal looks like from any angle — and inside a book, [the system uses page 1 as a character anchor](/blog/behind-the-illustrations) for the pages that follow. An angle the references do not show is an angle the AI will invent.",
    },
    {
      type: "heading",
      content: "Bursts are your friend",
    },
    {
      type: "paragraph",
      content:
        "Animals move. The single click of the shutter at the moment your dog finally looks at the camera is the moment they also blinked. Use burst mode (hold the shutter button down on iPhone / Android). You will get thirty frames in five seconds, two of which will be sharp and one of which will be perfect.",
    },
    {
      type: "paragraph",
      content:
        "This sounds like a small thing. It is not. Most of the bad reference sets we see could have been good if the photographer had taken five times as many photos and picked the best of each angle.",
    },
    {
      type: "heading",
      content: "Pose variety beats pose quality",
    },
    {
      type: "paragraph",
      content:
        "Three photos of your dog sitting on the couch are less useful than a sitting-on-the-couch photo plus a standing-in-the-yard photo plus a sleeping-on-the-rug photo, even if the couch photos are individually a little prettier. The AI is going to need to draw the pet in poses you did not photograph, and it builds up its ability to do that by seeing them in different ones.",
    },
    {
      type: "heading",
      content: "What confuses AI pet illustrations",
    },
    {
      type: "paragraph",
      content:
        "Direct list of things to avoid in reference photos, based on the failure modes we see most often:",
    },
    {
      type: "list",
      content: [
        "Sunglasses or hats on the pet. The AI sometimes reads the costume as part of the animal and tries to draw it on every page.",
        "Full Halloween or holiday costumes. Same problem. Strip the pet to their actual coat for references.",
        "Extreme close-ups where only one eye or only the nose is in frame. The system needs to see the whole face structure.",
        "Bathing or wet-fur photos. Wet fur looks different enough from dry fur that the AI gets the coat wrong.",
        "Photos with another pet in the frame. The AI sometimes cannot tell which animal you mean. One pet per reference photo.",
        "Heavy filters, beauty modes, or Snapchat-style edits. The face structure gets distorted.",
        "Black-and-white photos. The model needs the coat color.",
        "Very small or very pixelated photos. If you can barely see the dog clearly, the AI definitely cannot.",
      ],
    },
    {
      type: "heading",
      content: "What helps AI illustrations from pet photos look like your pet",
    },
    {
      type: "paragraph",
      content:
        "And the inverse list. Things that consistently produce better illustrations:",
    },
    {
      type: "list",
      content: [
        "The pet against a relatively plain, contrasting background. A dog on a green lawn is easier to parse than a dog on a busy patterned rug.",
        "Sharp focus on the eyes. Eyes are where the AI most strongly anchors character identity.",
        "Calm poses where the head and body are both visible and in plane. Action shots are great too, but they should be in addition to, not instead of.",
        "Recent photos. If the pet has aged, recent photos are more useful than puppy photos. The AI will lean on whatever it sees.",
        "If you have a strong distinguishing feature — a torn ear, a particular spot, a notable expression — a reference photo that shows it clearly is worth its weight in gold.",
      ],
    },
    {
      type: "heading",
      content: "The five-minute version",
    },
    {
      type: "paragraph",
      content:
        "If you have five minutes outside with your pet and want to take the best possible reference set: take the dog to a quiet shaded outdoor spot at midday. Get to their eye level. Burst-shoot a portrait of the face. Burst-shoot a profile of the whole body. Burst-shoot a three-quarter angle. Pick the sharpest from each burst. You have three excellent references. That is plenty.",
    },
    {
      type: "paragraph",
      content:
        "Five minutes spent here will improve your book more than any other five minutes you could spend in the flow. Worth the trip outside.",
    },
  ],
};
