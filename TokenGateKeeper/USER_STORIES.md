# TokenGateKeeper: Ambient FinOps Avatar & User Stories

This document specifies the user stories, developer journeys, visual behaviors, and state transitions of the **TokenGateKeeper Ambient FinOps Avatar** (tentatively named the **"FinOps Capybara"** or **"Spend Hound"**). The avatar acts as an active companion, floating over browser chats or IDE status bars to prevent financial waste and cognitive overload.

---

## 1. Avatar Visual Personas & State Matrix

The visual avatar is rendered using dynamic SVGs (matching the IBM Plex Mono style and warm-gold/monochromatic accents of the portfolio). It changes state based on prompt size, budget velocity, and rate limits:

| State | Visual Indicator | Trigger Event | Action/Message |
| :--- | :--- | :--- | :--- |
| **Chilling (Calm)** | Stable green/blue outline, capybara sipping tea | Context size $< 1,000$ tokens, routing to local or free NIM endpoints | *"Zero cost. Type away, boss."* |
| **Puzzled (Warning)** | Gold-yellow outline, tapping head, magnifying glass | Context size $> 8,000$ tokens, or premium model chosen for a basic query | *"Hold up. That is a massive rule-file payload for a tiny syntax check. Let me squeeze it?"* |
| **Panic (Alert)** | Shaking red outline, flashing eyes, sweat droplets | Recursive agent loop detected ($> 5$ requests/min), or transaction cost estimate $> \$0.50$ | *"EMERGENCY! Agent runaway detected. We are burning $\$0.60$ per minute on Claude Opus! Click to brake!"* |
| **Shield (Guard)** | Monospace shield logo, wearing sunglasses | Safe IP detection or ZDR policy violation triggered (e.g., Fable 5 code terms) | *"Legal warning: Insecure route detected. Let me swap to a local private container?"* |

---

## 2. Developer User Stories

### User Story 1: The Claude Web UI Interception (Browser Extension)
*   **As a** developer typing a query inside the Claude Chat web interface (`claude.ai`),
*   **I want** the FinOps Capybara to inject itself directly into the page's HTML next to the chat text field,
*   **So that** it can estimate my outgoing prompt size and offer to intercept before I spend expensive metered tokens.
*   **Scenario (Trivial edit on expensive endpoint)**:
    1.  The developer selects **Claude 3.5 Opus** or **Fable 5** in the web interface and pastes 500 lines of CSS with the prompt: *"Fix the border color of the input field."*
    2.  The injected Capybara detects a massive context block combined with a simple CSS formatting request.
    3.  The Capybara turns **Puzzled** and displays a speech bubble: *"You are about to empty a machine gun on a plebe! Let me route this simple edit to a free NVIDIA Nemotron-Nano endpoint instead?"*
    4.  The developer clicks the injected gold button **[Squeeze via NIM]**.
    5.  The prompt is redirected through the local TokenGateKeeper proxy, which sends the request to the free NIM endpoint, retrieves the formatting, and instantly populates the Claude chat field with the answer.
    6.  The browser UI reflects: *"Saved $\$0.08$ on this transaction!"*

---

### User Story 2: The IDE Recursive Loop Circuit Breaker (Cursor/Windsurf)
*   **As a** developer running background coding agents (like Cline or Windsurf),
*   **I want** the local proxy to count sequential calls and budget velocity,
*   **So that** the visual avatar can intervene if the agent enters an infinite self-correction loop.
*   **Scenario (Recursive Runaway)**:
    1.  An autonomous agent encounters a compiler warning in a loop and begins dispatching rapid, consecutive queries to **GPT-5.5-pro** to rewrite code.
    2.  TokenGateKeeper’s proxy counts 6 rapid calls in 45 seconds.
    3.  A desktop notification pops up containing the Capybara in **Panic** state: *"Recursive agent loop running! Velocity: $\$0.75/\text{min}$. Emergency brake active. I am pausing the queue."*
    4.  The proxy pauses the 7th outgoing request.
    5.  The developer clicks **[Approve Runaway]** to allow the agent to continue or **[Terminate Agent]** to wipe the local task context, saving up to $\$15.00$ in wasted tokens.

---

### User Story 3: Repetitive Prompt Crystallization
*   **As a** developer who repeatedly queries an LLM to perform identical code-formatting tasks,
*   **I want** the Capybara to compile that task into a permanent local script,
*   **So that** future requests bypass the external LLM entirely.
*   **Scenario (Crystallization)**:
    1.  The developer prompts: *"Convert this log file snippet into a markdown table"* for the 5th time in an hour.
    2.  The Capybara slides into view holding a scroll: *"I noticed you run this format command a lot. Let me compile this into a local script for you?"*
    3.  The developer clicks **[Crystallize]**.
    4.  The Orchestrator queries `nemotron-3-ultra-550b-a55b` to generate a local Python script `log_to_md.py` and registers it in the SQLite database.
    5.  The next time the developer inputs the prompt, the proxy intercepts, executes the local script instantly, and returns the result.
    6.  The Capybara gives a thumbs up: *"Executed locally! Time: 12ms. Cost: $\$0.00$. Savings: $\$0.04$!"*

---

### User Story 4: Multi-Key Sandbox Harvesting
*   **As a** developer opening the TokenGateKeeper configuration dashboard,
*   **I want** a unified interface where I can register multiple API keys and view active free endpoints,
*   **So that** I can leverage rate-limited sandboxes without manual configuration friction.
*   **Scenario (API Registry)**:
    1.  The developer opens `http://localhost:8080/dashboard`.
    2.  The Capybara greets the user: *"Welcome! Let's hook up our endpoints."*
    3.  The developer pastes their **NVIDIA API Key**.
    4.  The dashboard queries the NVIDIA NIM registry, validating connection to `nemotron-3-ultra-550b-a55b` and `llama-3.3-nemotron-super-49b-v1.5`.
    5.  The Capybara displays a checklist of active sandboxes: *"NVIDIA NIM Connected (40 RPM budget active). I will now automatically route intermediate queries here for free."*
