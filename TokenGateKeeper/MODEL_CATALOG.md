# TokenGateKeeper: Complete NVIDIA Model & Blueprint Catalog

This catalog outlines the full matrix of NVIDIA NIM models and blueprints hosted at `build.nvidia.com/nvidia`. TokenGateKeeper's **Cognitive Orchestrator** maps local system requests across these categories, utilizing specialized models for reasoning, translation, formatting, or security moderation.

---

## 1. Structured NIM Model Catalog

### 1.1 Language & Advanced Reasoning (LLMs)
These models serve as primary routing targets for text generation, code synthesis, and multi-turn planning:
*   **`nvidia/nemotron-3-ultra-550b-a55b`**: 550B MoE Hybrid (Mamba + Attention) with 1M context. Flagship code synthesis, architectural planning, and multi-file debugging model.
*   **`nvidia/llama-3.3-nemotron-super-49b-v1.5`**: 49B Dense. Excels in instruction compliance, strict formatting, and JSON tool calling.
*   **`nvidia/nvidia-nemotron-nano-9b-v2`**: 9B Hybrid Transformer-Mamba. Ultra-low-latency, efficient reasoning for inline autocompletion and code explanations.
*   **`nvidia/nemotron-mini-4b-instruct`**: 4B SLM. Designed for fast on-device inference, RAG, and basic function calls.
*   **`nvidia/llama-3.1-nemotron-nano-8b-v1`**: 8B reasoning model optimized for edge PCs.

### 1.2 Vision & Multimodal (VLMs & Document Parsing)
Used for ingesting design sketches, parsing database diagrams, and document metadata extraction:
*   **`nvidia/nemotron-nano-12b-v2-vl`**: 12B VLM. Enables visual Q&A, diagram interpretation, and code layout analysis.
*   **`nvidia/cosmos-reason2-8b`**: 8B Video VLM. Excels at video understanding and structured reasoning over physical worlds.
*   **`nvidia/nemotron-ocr-v1` / `nemoretriever-ocr`**: High-accuracy table, layout, and document structure text extraction.
*   **`nvidia/nemoretriever-page-elements-v2` / `nv-yolox-page-elements-v1`**: Object detection models fine-tuned to detect charts, titles, and diagrams in PDFs.
*   **`nvidia/nemotron-parse`**: Vision-language model for metadata and structural JSON extraction from images.

### 1.3 Speech, Translation & Audio
Integrates speech-to-text, translation layers, and audio formatting tools:
*   **`nvidia/canary-1b-asr` / `parakeet-ctc-1.1b-asr`**: Multi-lingual automatic speech recognition (ASR) and transcription.
*   **`nvidia/riva-translate-4b-instruct-v1_1` / `riva-translate-1.6b`**: Translation models covering 36 languages with few-shot capabilities.
*   **`nvidia/magpie-tts-zeroshot`**: Expressive text-to-speech (TTS) generated from small audio samples.
*   **`nvidia/Studio Voice` / `Background Noise Removal`**: Audio filters designed to clean speech audio for voice agent frontends.

### 1.4 Healthcare, Chemistry & Physical Science
Specialized models for biological, chemical, and physical simulation workloads:
*   **`nvidia/molmim` / `genmol`**: Controlled molecular generation, virtual screening, and fragment-based discrete diffusion.
*   **`nvidia/vista-3d`**: Specialized interactive medical annotation for segmenting 3D human anatomy.
*   **`nvidia/fourcastnet`**: Predicts global atmospheric dynamics and weather forecasting.

### 1.5 Safety, Moderation & Guardrails
Pre-flight filters validating input safety, stripping PII, and checking for prompt injections before dispatching requests:
*   **`nvidia/llama-3.1-nemoguard-8b-content-safety` / `nemotron-3.5-content-safety`**: Multi-lingual, context-aware toxic content filters.
*   **`nvidia/nemoguard-jailbreak-detect`**: Detects adversarial jailbreak attempts on incoming prompt streams.
*   **`nvidia/llama-3.1-nemoguard-8b-topic-control`**: Restricts conversation flows to designated system topics.
*   **`nvidia/gliner-pii`**: Identifies and redacts Personally Identifiable Information in prompt payloads.

### 1.6 Retrieval & Code Embeddings
Grounds coding models in local codebase repositories (RAG) and searches syntax logs:
*   **`nvidia/nv-embedcode-7b-v1`**: 7B Mistral-based embedding model optimized for code retrieval, text, and hybrid queries.
*   **`nvidia/nv-embed-v1` / `nv-embedqa-e5-v5`**: Text embedding models for question-answering retrieval.
*   **`nvidia/llama-nemotron-rerank-1b-v2` / `rerank-qa-mistral-4b`**: Reranking search outputs to compress token inputs.

---

## 2. Integrated NVIDIA System Blueprints

Blueprints are production-ready microservice systems that TokenGateKeeper wraps as local stdio MCP servers:

### 2.1 Developer & Code Blueprints
*   **Nsight Copilot - AI Code Assistant for CUDA**: Deployable CUDA programming coding assistant with retrieval-augmented generation.
    ```mermaid
    graph TD
        IDE["Developer Workspace: VS Code / Visual Studio"] -->|CUDA Code Context| CopilotAgent["Nsight Copilot Agent"]
        CopilotAgent -->|Retrieval Query| Retriever["NeMo Retriever"]
        Retriever -->|Grounds response in| KB["GPU Programming Knowledge Base"]
        CopilotAgent -->|Dispatches prompt| NIMRouter["LLM Router"]
        NIMRouter -->|Generates solution| NIM["Nemotron Coding NIMs"]
        NIM -->|Returns Code & Suggestions| IDE
        IDE -->|Compile & Run Kernels| GPU["DGX Spark / Local GPU Execution"]
    ```

*   **NemoClaw (Hermes / OpenClaw)**: An agent framework that learns from team workflows, creates reusable skills, and packages them dynamically without reboots.
    ```mermaid
    graph LR
        UserTeam["Team of Users & Agents"] -->|Slack Gateway| Slack["Slack Portal"]
        Slack -->|Dispatches to| HermesTeam["Hermes Agent Team"]
        HermesTeam -->|Skill Evolution| SkillsLib["Skills Library"]
        SkillsLib -->|Generates| SkillBundle["Skill Bundle"]
        SkillBundle -->|Exposes| OpenShelf["OpenShelf Runtime"]
        HermesTeam -->|Triggers| Orchestrator["Orchestrator: Nemotron 3 Ultra"]
        Orchestrator --> CodingAgent["Coding Agent"]
        Orchestrator --> SpecialOpen["Special Agents (Open Models)"]
        Orchestrator --> SpecialNano["Special Agents (Nemotron 3.5 Nano)"]
        CodingAgent -->|Runs Actions on| Tools["Tools System: GitHub, Slack, DB"]
        SpecialOpen -->|Runs Actions on| Tools
        SpecialNano -->|Runs Actions on| Tools
        Tools -->|Learning Loop: Code Synthesis| SkillsLib
    ```

### 2.2 FinOps & Infrastructure Blueprints
*   **LLM Router**: Balances LLM requests across model endpoints based on price, context size, and queue rate limits.
*   **Safety for Agentic AI**: Evaluates agent interaction chains for compliance, security, and data leakage.
*   **Vulnerability Analysis for Container Security**: Automated scanning of docker containers for potential architectural vulnerabilities.

### 2.3 RAG & Document Blueprints
*   **Build an Enterprise RAG Pipeline**: Ingests multimodal document trees, vectorizes text, and grounds local chat queries.
*   **PDF to Podcast**: Automatically structures PDFs into audio podcast transcripts, running them through TTS.
*   **Video Search and Summarization (VSS)**: Extracts metadata and semantic layouts from live or archived video feeds.

### 2.4 Quantitative & Finance Blueprints
*   **Quantitative Signal Discovery Agent**: Automates research, testing, and refinement of quantitative trading signals.
*   **Quantitative Portfolio Optimization**: Solves mathematical portfolio allocation models in real time.
*   **Build Your Own Transaction Foundation Model**: Learns tabular patterns to generate embeddings for fraud detection.

### 2.5 Industrial & Physical AI
*   **Multi-Agent Intelligent Warehouse**: Orchestrates multi-agent robots to schedule routing paths in warehouses.
*   **Omniverse DSX Blueprint for AI Factory Digital Twins**: Visualizes and optimizes server racks and factory floor digital twins.
*   **Synthetic Manipulation for Robotics**: Generates robotic joint motion trajectories from few human demonstrations.

### 2.6 Medical & Science Blueprints
*   **Biomedical AI-Q Research Agent**: Ingests molecular papers and retrieves target-disease interactions.
*   **Generative Virtual Screening**: Speeds small-molecule chemical screening for target drug designs.

---

## 3. Web Plugin Variant (Client-Side Injection)

For browser-based interfaces (Claude.ai, Chat.openai.com, Gemini web), the system runs as a thin script/extension. The user registers their own personal `NVIDIA_API_KEY` on `build.nvidia.com` and inputs it into the extension config.

### 3.1 Content Script Injection Code (OpenAI ES Module)
The browser extension listens to textarea inputs and overrides submission when the user triggers the gold `[Send via NIM]` button:

```javascript
import OpenAI from 'openai';

// Local config holds user-generated NVIDIA key
const config = {
  apiKey: 'USER_PASTED_NVIDIA_API_KEY', // e.g. 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
  baseURL: 'https://integrate.api.nvidia.com/v1',
};

const openai = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  dangerouslyAllowBrowser: true // Required for extension execution context
});

async function routeToNIM(promptText, outputContainerCallback) {
  try {
    const completion = await openai.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [{"role": "user", "content": promptText}],
      temperature: 1.0,
      top_p: 0.95,
      max_tokens: 16384,
      extra_body: {
        "chat_template_kwargs": {"enable_thinking": true},
        "reasoning_budget": 16384
      },
      stream: true
    });
     
    let fullReasoning = '';
    let fullContent = '';

    for await (const chunk of completion) {
      const reasoning = chunk.choices[0]?.delta?.reasoning_content;
      const content = chunk.choices[0]?.delta?.content || '';

      if (reasoning) {
        fullReasoning += reasoning;
        // Output reasoning trace (e.g., rendering inside the Capybara's thinking bubble)
        outputContainerCallback({ type: 'reasoning', text: reasoning });
      }
      
      if (content) {
        fullContent += content;
        // Output standard model response directly into chat input area
        outputContainerCallback({ type: 'content', text: content });
      }
    }
  } catch (error) {
    console.error("NIM Routing Error:", error);
    outputContainerCallback({ type: 'error', text: error.message });
  }
}
```
