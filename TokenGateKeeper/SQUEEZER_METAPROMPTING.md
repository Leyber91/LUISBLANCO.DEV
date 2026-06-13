# TokenGateKeeper: The Squeezer Metaprompting Specification

"The Squeezer" is a dynamic prompt warp compiler built into the routing pipeline of TokenGateKeeper. Its goal is to elevate cheap or free models (such as `nvidia/nemotron-3-ultra-550b-a55b` or `moonshotai/kimi-k2.6`) by wrapping baseline prompts with structured instructions, few-shot alignments, and Chain-of-Thought (CoT) protocols. This forces open-weight endpoints to deliver logic, architectural styling, and syntax precision that matches premium models like Claude 3.5 Sonnet or GPT-4o.

---

## 1. The Squeezing Wrapper Architecture

When a request is intercepted and routed to a squeezed model, the compiler processes the prompt payload through three distinct translation phases:

```
[Incoming Prompt] ──► [1. CoT Injector] ──► [2. Few-Shot Fetcher] ──► [3. Output Schema Enforcer] ──► [Squeezed Prompt]
```

### 1.1 CoT (Chain-of-Thought) Injection
Cheap models often hallucinate or skip logical steps when presented with direct coding tasks. The Squeezer prefixes the user's instructions with a strict execution chain that mandates cognitive reasoning *before* generating code.

### 1.2 Few-Shot Context Retrieval
The proxy checks the SQLite database of historical successful queries. It retrieves the most semantically relevant prompt-response pair and mounts it as an inline conversation snippet (`role: user` / `role: assistant`), demonstrating the target code style, file formats, and complexity structure.

### 1.3 Strict Output Schema Formatting
To prevent verbose conversational filler ("Sure, I can help you with that! Here is the code:"), The Squeezer injects an instruction block demanding strict XML tags or JSON structure.

---

## 2. Standardized Metaprompt Templates

Below is the master metaprompt injected into the system message space when squeezing intermediate-tier tasks for `llama-3.3-nemotron-super-49b-v1.5` or `nvidia/nemotron-3-ultra-550b-a55b`:

```markdown
You are a senior systems architect operating under strict execution rules.
Your output must match the structure of a premium reasoning engine (Claude 3.5 Sonnet).

=== REASONING PROTOCOL ===
1. You MUST generate an internal, detailed reasoning trace before providing any code.
2. Break down the task into:
   a. Dependency graph analysis
   b. Potential architectural regressions
   c. Specific lines of code to modify
3. Place this thinking process inside <thinking>...</thinking> tags.

=== CODE EMULATION RULES ===
- Do NOT provide conversational prefixes or suffixes (e.g., "Here is the code you requested").
- Output the code changes directly.
- For modifications, output only the relevant lines inside standard markdown code blocks, prefixed with file paths.
- Ensure strict typing (TypeScript, Python typings, etc.) and complete error handling are written.
- Adhere to the following code layout:
  ```[language]
  // File: [relative/path/to/file]
  [code contents]
  ```
```

---

## 3. Streaming Interception & SSE Parsing

To keep the developer flow uninterrupted, the Squeezer strips thinking blocks from the stream before rendering them in the IDE if the IDE does not natively support rendering `<thinking>` blocks. 

*   **Streaming Mode Flow**:
    1.  The proxy establishes a stream with the NIM endpoint.
    2.  As chunks arrive, the proxy checks for the `<thinking>` tag.
    3.  If found, the proxy routes the contents of the thinking trace to a local debugger console or the **TokenGateKeeper Dashboard** WebSocket channel, keeping the IDE chat window clean.
    4.  Once the closing `</thinking>` tag is detected, the proxy starts forwarding all subsequent text directly to the IDE client stream.

This process shields the developer from the token bloat of reading long-form thinking blocks in the chat box while still providing access to the raw reasoning via the local dashboard telemetry.
