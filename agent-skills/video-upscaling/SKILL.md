---
name: video-upscaling
description: Increase the resolution of an existing video when the user explicitly asks for it.
---
Use `upscale_video` only for an existing HTTPS video URL and only when the user asks for clearer or higher-resolution output.

Use `1080p` unless the user explicitly asks for 4K, then use `2160p`. Do not invent a source URL, promise an output before the tool completes, or retry provider failures automatically.
