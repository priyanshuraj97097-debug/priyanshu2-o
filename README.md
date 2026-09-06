# Priyanshu 2.o Assistant

Build a new production-ready AI assistant application called "Priyanshu 2.o".



IMPORTANT:

This is a NEW application. Build it cleanly and modularly. Do not create a simple chatbot or demo. The goal is a full multimodal AI assistant platform with a smooth experience comparable to leading AI assistants.



Use original Priyanshu 2.o branding. Do not copy any company's branding, logo, proprietary assets, or exact UI.



CORE EXPERIENCE:

Users should be able to open Priyanshu 2.o and immediately start chatting without selecting a mode.



The AI should automatically understand whether the user wants:

- normal conversation

- coding

- mathematics

- reasoning

- writing

- analysis

- summarization

- translation

- image generation

- image understanding

- document analysis

- video understanding

- web research

- voice conversation

- brainstorming

- planning



Do not force users to manually switch between modes.



MULTIMODAL INPUT:

Support:

- text

- images

- PDFs

- documents

- other supported files

- microphone input

- live voice conversation

- video/file analysis where supported



The AI should understand uploaded images and documents and answer questions about them.



IMAGE GENERATION:

Add real image-generation functionality.

When the user requests an image, automatically detect the request and use the configured image-generation provider.

Support image prompts, image references where supported, and high-quality output.

Do not use fake image-generation responses.



VOICE:

Implement real speech-to-text and text-to-speech.

Microphone:

User speaks → accurate transcription → message sent to AI.



Listen:

AI response → real speech playback.



Live Conversation:

User speaks → speech detection → transcription → AI response → spoken response → automatically listen for the next turn.



Do not create fake Listening/Processing loops.

Do not return to listening until the AI has actually produced its response.

Support multiple languages and voices where the selected providers support them.

Include mute, stop, replay, and voice-selection controls.



CHAT:

Support:

- new chat

- multiple simultaneous conversations

- conversation history

- rename conversation

- delete conversation

- search conversations

- continue old conversations

- automatic conversation titles



When a user starts a new chat while another AI response is generating, keep the previous generation running independently in the background.

The new chat must open immediately.

Multiple conversations must be able to run independently.



PROMPT CONTROLS:

Allow users to:

- edit their previous prompt

- resend an edited prompt

- retry an AI response

- copy AI responses

- regenerate responses where supported



Editing a previous prompt must actually work and correctly update the conversation from that point.



MATH:

Create a dedicated high-accuracy mathematical reasoning pipeline.

Support:

- arithmetic

- algebra

- equations

- geometry

- trigonometry

- calculus

- probability

- statistics

- matrices

- complex numbers

- word problems

- advanced mathematics



Use reliable calculation tools when appropriate instead of relying only on language-model mental arithmetic.

Verify calculations before answering.

Show clear step-by-step solutions when useful.



Use normal mathematical notation only.

Avoid strange, decorative, unnecessary, or unsupported symbols.



CODING:

Support code generation, debugging, explanation, refactoring, and multiple programming languages.

Use proper Markdown code blocks and syntax formatting.

Add code-copy functionality.



WEB RESEARCH:

Create a modular web-search/tool layer so web search can be added or connected securely.

When web search is available, the AI should distinguish between its own knowledge and information retrieved from the web.

Show useful sources/citations.



FILES:

Allow users to upload supported files and ask questions about them.

Maintain file context during the conversation.

Handle large files efficiently.

Never expose private files or API keys.



MEMORY:

Create optional user memory.

Remember useful user preferences and information only when appropriate.

Allow users to view, edit, delete, or disable memory.



AI ARCHITECTURE:

Do NOT hard-code the application around one AI provider.



Create a modular provider layer supporting:

- Gemini

- future OpenAI-compatible providers

- future image-generation providers

- future speech providers

- future search providers



Keep provider credentials server-side only.



Use secure backend/server functions for all AI provider requests.



Never expose API keys in:

- frontend code

- browser environment variables

- localStorage

- sessionStorage

- public files

- GitHub



The model/provider should be configurable from the server.



PERFORMANCE:

Prioritize extremely smooth interaction.

Use streaming responses.

Do not fake loading delays.

Do not freeze the UI.

Do not repeatedly reload conversations.

Do not fetch the entire conversation unnecessarily after every message.

Use efficient state updates.

Allow the user to continue navigating while AI responses are generating.



If a request fails, show a useful retry option instead of a generic broken screen.



ERROR HANDLING:

Handle:

- API errors

- rate limits

- quota errors

- network failures

- timeouts

- empty responses

- invalid files

- microphone permissions

- speech recognition failures

- speech synthesis failures

- image-generation failures



Never expose technical secrets or stack traces to users.



UI:

Create a premium, futuristic, original Priyanshu 2.o interface.



Include:

- clean home screen

- large central prompt area

- conversation sidebar

- new chat

- search

- settings

- profile

- attachments

- microphone

- voice/live conversation

- send button

- stop-generation button

- model/provider information where appropriate



Use subtle blue, cyan, purple, and pink futuristic effects.

Keep animations lightweight.

Respect prefers-reduced-motion.



MOBILE:

Make mobile a first-class experience.

Support Android phones, iPhones, tablets, and desktop browsers.

The keyboard must not cover the composer.

Automatically manage keyboard visibility during AI generation and voice interaction.

The composer must remain accessible and comfortable.



SETTINGS:

Include useful settings rather than only Sign Out:

- account

- appearance

- language

- voice

- memory

- privacy

- chat settings

- notification preferences

- data controls

- model preferences where appropriate

- sign out



SECURITY:

Use Supabase authentication/database if appropriate.

Keep users' conversations isolated.

Users must only access their own conversations and files.

Use proper authorization checks on every backend operation.



DATABASE:

Use a clean scalable architecture for:

- profiles

- conversations

- messages

- uploaded files

- model configurations

- user preferences

- memory

- tool calls

- usage

- subscriptions



BRANDING:

Use exactly:

"Priyanshu 2.o"



Do not display provider names such as Gemini throughout the user-facing interface.

Provider names may exist internally where technically necessary.



QUALITY REQUIREMENT:

Do not implement fake buttons, placeholder AI responses, simulated voice, simulated image generation, or fake live conversation.



Every visible feature must either work or be clearly marked as unavailable.



Before considering the application complete, test:

1. normal conversation

2. multiple conversations

3. background generation

4. prompt editing

5. prompt retry

6. conversation deletion

7. image understanding

8. image generation

9. file analysis

10. mathematics

11. coding

12. microphone transcription

13. Listen/TTS

14. complete Live Conversation turn-taking

15. multiple languages for voice

16. mobile keyboard behavior

17. error recovery

18. authentication

19. conversation persistence

20. security of API keys



The architecture must make it possible to add better AI models and tools later without rebuilding the application.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://priyanshu2-o.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dd32e6e7-6db0-4766-954d-1836ea3e084e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
