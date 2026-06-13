# TokenGateKeeper: Retail & Media Blueprints Specification (Deep Dive)

This document details the architectural layouts, API endpoints, audio/video pipelines, and integration interfaces for NVIDIA Retail & Media Blueprints.

---

## 1. Retail Agentic Commerce

### 1.1 Technical Objective
Reference implementation of the Agentic Commerce Protocol (ACP) and Universal Commerce Protocol (UCP), allowing autonomous customer-negotiated checkouts.

### 1.2 System Architecture & Container Topology

```mermaid
graph TD
    Buyer["Buyer Agent (Llama 3.3)"] -->|1. Submit price proposal: '$10'| Merchant["Merchant Agent (Llama 3.3)"]
    Merchant -->|2. Query margins & stock| ERP[("ERP Inventory System")]
    ERP -->|3. Margin rules & count| Merchant
    Merchant -->|4. If price approved| Payment["Payment Gateway (Stripe Node)"]
    Merchant -->|5. If price too low: Counter-offer| Buyer
    Payment -->|6. Payment success confirmation| ERP
```

### 1.3 Container Specifications & Environment Variables
*   **`merchant-negotiation-node`**: Manages negotiation dialogues and queries inventory limits.
*   **`erp-mock-connector`**: Connects mock inventory database nodes.
*   **`stripe-payment-bridge`**: Direct API connection to Stripe checkout services.

```yaml
COMMERCE:
  MARGIN_FLOOR_PERCENT: "0.15"
  INVENTORY_SERVER: "http://erp-server:8090"
  STRIPE_PUBLIC_KEY: "pk_test_..."
```

### 1.4 Step-by-Step Pipeline Flow
1.  **Negotiation Request**: The Buyer Agent posts a price proposal (e.g. *"I want this item for $10"*) to the merchant agent.
2.  **Margin Validation**: The Merchant Agent queries the ERP system to verify stock levels and retrieve the absolute margin floor price.
3.  **Pricing Decision**: If the proposed price exceeds the floor price, the Merchant Agent approves and calls the Stripe Payment Gateway. If it's too low, it generates a counter-offer (e.g. *"$11 with free shipping"*).
4.  **Checkout Resolution**: Upon buyer acceptance, Stripe completes the transaction and the ERP system decrements inventory.

### 1.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/commerce/negotiate`
*   **Request JSON**:
    ```json
    {
      "session_id": "sess_retail_456",
      "buyer_proposal": {
        "item_id": "sku_99321",
        "proposed_price": 10.00,
        "quantity": 1
      }
    }
    ```
*   **Response JSON**:
    ```json
    {
      "status": "counter_offer",
      "proposal_resolved": false,
      "merchant_response": {
        "counter_price": 11.00,
        "free_shipping": true,
        "message": "We cannot sell for $10.00, but we can offer it for $11.00 with free shipping."
      }
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Hardware Requirements**:
  * Expect that you will want the NIM microservices to be self-hosted as you progress in your agentic commerce development. For self-hosting the project with these microservices locally deployed, the recommended system requirement is 2xA100 or 2xH100 GPUs — one for the NVIDIA Nemotron LLM NIM for intelligent promotion strategy selection, multilingual post-purchase messaging, and multi-agent recommendation orchestration, and one for the NV-EmbedQA-E5 NIM for semantic product embeddings powering vector search and the ARAG recommendation pipeline. Additionally, a Milvus vector database instance is required for product catalog embeddings, and Arize Phoenix is recommended for distributed tracing and observability across the multi-agent workflow.
*   **Deployment Options**:
  * Docker 28.0+
  * Docker compose

---


## 2. Nemotron Voice Agent

### 2.1 Technical Objective
A low-latency audio agent pipeline connecting ASR, LLM reasoning, and TTS for fluid voice chat.

### 2.2 System Architecture & Container Topology

```mermaid
graph LR
    Mic["User Speech (Audio Mic Stream)"] -->|1. PCM Audio Chunks| ASR["Riva Streaming ASR NIM"]
    ASR -->|2. Streaming text transcription| Agent["Conversational Agent (Nemotron 3 Ultra)"]
    Agent -->|3. Streaming text responses| TTS["Riva Speech Synthesis TTS NIM"]
    TTS -->|4. Synthesized audio chunks| Speaker["User Speaker Output"]
```

### 2.3 Container Specifications & Environment Variables
*   **`riva-asr-nim`**: Real-time automatic speech recognition container.
*   **`riva-tts-nim`**: Real-time text-to-speech synthesis container.
*   **`nemotron-conversational-agent`**: Direct conversational logic handler.

```yaml
VOICE:
  RIVA_SERVER_URL: "localhost:50051"
  LANGUAGE_CODE: "en-US"
  ASR_AUDIO_FORMAT: "LINEAR_PCM"
```

### 2.4 Step-by-Step Pipeline Flow
1.  **Audio Stream Capture**: The microphone stream sends raw PCM audio chunks via a WebSocket connection.
2.  **ASR Processing**: The `riva-asr-nim` container transcribes the audio, streaming the text output to the conversational agent.
3.  **Response Generation**: The `nemotron-conversational-agent` runs context planning and streams response text.
4.  **TTS Generation**: The `riva-tts-nim` synthesizes the text into audio tracks.
5.  **Audio Playback**: The audio chunks are returned over the WebSocket connection to the user's speaker.

### 2.5 API Schema & JSON Payload
*   **Endpoint**: `/v1/voice/stream` (WebSocket Connection)
*   **Audio Data Chunk Format**: Binary WebM / PCM data packet stream.
*   **Control JSON Message**:
    ```json
    {
      "action": "start_session",
      "voice_id": "en_us_female_magpie",
      "sampling_rate": 16000
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Hardware Requirements**:
  * 1x NVIDIA A100 (40GB/80GB) or L40S GPU for hosting ASR/TTS and Nemotron NIM microservices locally.
*   **OS Requirements**:
  * Ubuntu 22.04 LTS
*   **Software Requirements**:
  * NVIDIA Container Toolkit, Riva SDK, Docker Compose

---


## 3. Content Localization

### 3.1 Technical Objective
Ingests videos, translates the speaker's vocal tracks, and edits the video frames to sync lip movements to the translated audio.

### 3.2 System Architecture & Container Topology

```mermaid
graph TD
    Video["Source Video File"] -->|1. Demux| Splitter["Audio-Video Splitter"]
    Splitter -->|2. Raw audio track| ASR["Riva Speech to Text"]
    ASR -->|3. Transcription text| Trans["Translation Model NIM (4b-instruct)"]
    Trans -->|4. Translated text| TTS["Riva Text to Speech"]
    Splitter -->|5. Raw video frames| LipSync["LipSync NIM Generator"]
    TTS -->|6. Translated audio track| LipSync
    LipSync -->|7. Re-encoded frames & audio| Muxer["AV Muxer Node"]
    Muxer -->|8. Localized video file| LocalizedVideo["Translated Video File"]
```

### 3.3 Container Specifications & Environment Variables
*   **`translation-nim`**: Translates text while preserving timing markers.
*   **`lipsync-generator-nim`**: Generates matching mouth and lip contours from audio phonemes.
*   **`ffmpeg-muxer`**: Splits and merges video streams.

```yaml
LOCALIZATION:
  SOURCE_LANGUAGE: "en"
  TARGET_LANGUAGE: "es"
  RESOLUTION: "1920x1080"
```

### 3.4 Step-by-Step Pipeline Flow
1.  **Demuxing**: The video file is separated into raw audio and video frame streams.
2.  **Transcription**: The audio track is transcribed by Riva ASR.
3.  **Translation**: The text is translated by the translation model, maintaining timing tags.
4.  **Speech Synthesis**: Riva TTS generates the translated audio.
5.  **Lip Synchronization**: The `lipsync-generator-nim` processes the video frames to align mouth movements with the target audio.
6.  **Muxing**: The final video and audio tracks are merged into a localized video file.

### 3.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/localization/translate`
*   **Request JSON**:
    ```json
    {
      "video_path": "/data/source/presentation.mp4",
      "target_lang": "es",
      "voice_matching": true
    }
    ```
*   **Response JSON**:
    ```json
    {
      "task_id": "loc_task_789",
      "status": "processing",
      "progress": 0.0,
      "estimated_remaining_seconds": 120
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Hardware Requirements**:
  * 2x NVIDIA A100 (80GB) or L40S GPUs (one for LipSync synthesis, one for speech translations).
*   **OS Requirements**:
  * Ubuntu 22.04 LTS
*   **Software Requirements**:
  * Docker Compose, NVIDIA Container Toolkit, FFmpeg 5.0+

---


## 4. Retail Catalog Enrichment

### 4.1 Technical Objective
Automates description formatting, catalog asset organization, and localized translations of bulk catalog uploads.

### 4.2 System Architecture & Container Topology

```mermaid
graph TD
    Sheet[("CSV Product Sheet Upload")] -->|1. Parse columns| cuDF["cuDF Dataframe Engine"]
    cuDF -->|2. Standardized item parameters| Search["NeMo Retriever (Catalog RAG)"]
    Search -->|3. Retrieve manufacturer spec sheets| VectorDB[("Spec Sheets Database")]
    VectorDB -->|4. Retrieved details| Enricher["Catalog Enricher (nemotron-3-nano-30b-a3b)"]
    Enricher -->|5. SEO descriptions & categories| DB[("Enriched Catalog DB")]
```

### 4.3 Container Specifications & Environment Variables
*   **`cudf-catalog-parser`**: Parses and structures CSV catalogs.
*   **`catalog-enricher-nim`**: Generates titles, descriptions, and tag attributes.

```yaml
CATALOG:
  CATALOG_DB_URL: "postgresql://catalog_user:pass@localhost:5432/catalog"
  SEO_LOCALE: "en-US"
```

### 4.4 Step-by-Step Pipeline Flow
1.  **Ingestion**: A raw catalog sheet is parsed by the `cuDF` engine.
2.  **RAG Enrichment**: `NeMo Retriever` searches the specification database for matching product documentation.
3.  **Attribute Generation**: `nemotron-3-nano-30b-a3b` writes SEO descriptions and assigns tags based on retrieved data.
4.  **Database Write**: The enriched product entry is written to the catalog database.

### 4.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/catalog/enrich`
*   **Request JSON**:
    ```json
    {
      "input_file": "/data/catalog/raw_shoes.csv",
      "enrichment_options": {
        "generate_seo_descriptions": true,
        "assign_categories": true
      }
    }
    ```
*   **Response JSON**:
    ```json
    {
      "status": "completed",
      "processed_items": 1420,
      "enriched_output_file": "/data/catalog/enriched_shoes.csv"
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Hardware Requirements**:
  * Expect that you will want the NIM microservices to be self-hosted as you progress in your catalog enrichment pipeline development. For self-hosting the project with these microservices locally deployed, the recommended system requirement is 4 H100 GPUs with the NVIDIA Nemotron nano omni NIM for visual product analysis and content augmentation, the NVIDIA Nemotron LLM NIM for culturally-aware prompt planning and quality assessment, the FLUX NIM for localized product image generation, and the Microsoft TRELLIS model for 3D asset generation. Additionally, scalable storage infrastructure is required for managing generated assets including product variations, 3D models, metadata, and quality assessment artifacts.
*   **Deployment Options**:
  * Docker 28.0+
  * Docker compose

---


## 5. Retail Shopping Assistant

### 5.1 Technical Objective
Context-aware retail chatbot recommending target products using natural dialogue and semantic search.

### 5.2 System Architecture & Container Topology

```mermaid
graph TD
    Query["User: 'Show me size 10 trail shoes'"] -->|1. Route| Assistant["Shopping Assistant Agent"]
    Assistant -->|2. Structured query| Retriever["NeMo Retriever microservice"]
    Retriever -->|3. Vector query| Catalog[("Catalog Vector Store")]
    Catalog -->|4. Product hits| Assistant
    Assistant -->|5. Check formatting & guidelines| Guardrails["NeMo Guardrails Node"]
    Guardrails -->|6. Verified recommendations| Query
```

### 5.3 Container Specifications & Environment Variables
*   **`shopping-assistant-agent`**: Orchestrates user sessions and coordinates search.
*   **`nemo-guardrails-node`**: Validates recommendations against inventory availability and pricing limits.

```yaml
ASSISTANT:
  INVENTORY_INDEX: "milvus-catalog"
  MAX_RECOMMENDATIONS: "3"
```

### 5.4 Step-by-Step Pipeline Flow
1.  **User Query**: The user asks for product recommendations.
2.  **Semantic Search**: The query is routed to `NeMo Retriever`, which searches the product catalog.
3.  **Guardrail Evaluation**: The results are passed to NeMo Guardrails to filter out unavailable items.
4.  **Output Display**: The final recommendations are presented to the user.

### 5.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/shopping/chat`
*   **Request JSON**:
    ```json
    {
      "session_id": "user_sess_112",
      "message": "I need running shoes under $100",
      "user_profile": {"shoe_size": 10}
    }
    ```
*   **Response JSON**:
    ```json
    {
      "response": "Here are recommendations under $100:",
      "products": [
        {
          "sku": "sku_102",
          "name": "TrailRunner X",
          "price": 89.99,
          "availability": "in_stock"
        }
      ]
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Hardware Requirements**:
  * 4 x H100 (Locally hosted models)
*   **Deployment Options**:
  * Docker

---


## 6. Streaming Data to RAG

### 6.1 Technical Objective
Real-time ingestion of live sensors, logs, or system streams, updating vector indexes dynamically.

### 6.2 System Architecture & Container Topology

```mermaid
graph LR
    DataStream["Live Event Data Stream (Kafka)"] -->|1. Ingest| Embedder["nv-embedcode-7b-v1 NIM"]
    Embedder -->|2. High-dimensional vector| Writer["Milvus Vector Writer"]
    Writer -->|3. Dynamic index update| VectorStore[("Milvus Vector Store")]
    Developer["Query: 'Check thread concurrency errors'"] -->|4. Vector search| VectorStore
```

### 6.3 Container Specifications & Environment Variables
*   **`kafka-stream-consumer`**: Subscribes to events from Kafka topics.
*   **`nv-embedcode-nim`**: Computes text embeddings.

```yaml
STREAM:
  KAFKA_BROKERS: "localhost:9092"
  KAFKA_TOPIC: "application_logs"
  VECTOR_DIMENSION: "4096"
```

### 6.4 Step-by-Step Pipeline Flow
1.  **Event Capture**: Events from Kafka stream into the consumer.
2.  **Vectorization**: The payload is processed by the embedder.
3.  **Index Update**: The vectors are written directly to the Milvus store, enabling immediate search capability.

### 6.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/rag/stream-ingest`
*   **Request JSON**:
    ```json
    {
      "stream_id": "logs_stream",
      "payload": {
        "timestamp": "2026-06-13T05:00:00Z",
        "message": "Database connection lost: timeout exception"
      }
    }
    ```
*   **Response JSON**:
    ```json
    {
      "status": "ingested",
      "vector_id": "vec_55321",
      "index_latencies_ms": 4.2
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Hardware**:
  * For Data Center Deployment: NVIDIA L40, L40S, or any data center GPU of equal or greater capability
  * For Desktop Deployment: NVIDIA RTX™ 5090, RTX A6000, or equivalent high-end consumer or professional GPU
  * VRAM: 24 GB
  * These GPUs ensure sufficient memory and compute resources for advanced AI, visualization, and generative workloads.
*   **Software**:
  * OS Requirements: Ubuntu 22.04
  * Deployment: Docker Compose
  * NVIDIA Technology
  * Llama NeMo Retriever 3.2 embedding NIM (deployed locally)
  * Llama NeMo Retriever 3.2 reranking NIM (API endpoint)
  * NVIDIA Riva Parakeet ASR NIM (deployed locally)
  * NVIDIA Nemotron Nano 9b v2 (API endpoint)
  * NVIDIA Holoscan
  * NVIDIA NeMo Agent Toolkit UI
  * Context Aware RAG
  * 3rd Party Software
  * PyTorch
  * CuPy
  * Librosa

---


## 7. Build an Enterprise RAG Pipeline Blueprint

### 7.1 Technical Objective
Production-ready RAG pipeline connecting PDF stores, wikis, and markdown indices with low-latency search.

### 7.2 System Architecture & Container Topology

```mermaid
graph TD
    DocStore["Enterprise Document Store"] -->|1. Load PDF/DOCX| Parsing["nemoretriever-parse"]
    Parsing -->|2. OCR text & tables| Embedding["llama-nemotron-embed-1b-v2"]
    Embedding -->|3. Store vectors| DB[("Vector Database")]
    Query["User Search Prompt"] -->|4. Match query| Rerank["llama-nemotron-rerank-1b-v2"]
    Rerank -->|5. Reorder results| Grounding["nemotron-3-super-120b-a12b"]
    Grounding -->|6. Grounded response| Query
```

### 7.3 Container Specifications & Environment Variables
*   **`nemoretriever-parse`**: Layout-aware parser extracting text and tables from documents.
*   **`llama-nemotron-embed-1b-v2`**: Computes document embeddings.
*   **`llama-nemotron-rerank-1b-v2`**: Reorders search results based on relevance.

```yaml
RAG:
  DOCUMENT_DIR: "/data/enterprise_docs"
  CHUNK_SIZE: "512"
  TOP_K_RETRIVE: "10"
```

### 7.4 Step-by-Step Pipeline Flow
1.  **Parsing**: PDF manuals are processed by the parsing service.
2.  **Embedding**: Text chunks are embedded and saved to the vector database.
3.  **Reranking**: The retriever finds matching candidates, and the rerank model reorders them by relevance.
4.  **Response Generation**: The grounded response is generated by `nemotron-3-super-120b-a12b`.

### 7.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/enterprise-rag/query`
*   **Request JSON**:
    ```json
    {
      "query": "What is our corporate policy on remote work?",
      "filter_tags": ["HR", "Benefits"],
      "reranking_enabled": true
    }
    ```
*   **Response JSON**:
    ```json
    {
      "response": "Employees are permitted to work remotely up to 3 days per week.",
      "citations": [
        {"document": "HR_Policy_2026.pdf", "page": 4}
      ],
      "tokens_consumed": 2045
    }
    ```

### System Prerequisites & Minimum Requirements
*   **General**:
  * Hardware Requirements
  * The blueprint can be deployed with Docker or Kubernetes-based platforms. By default, it deploys the referenced NIM microservices locally. Each method lists its minimum required hardware. This will change if the deployment turns on optional configuration settings.
  * Docker
  * 
  * 3 x H100
  * 3 x B200
  * 3 x RTX PRO 6000
  * 
  * 
  * 
  * Kubernetes
  * 
  * 8 x H100-80GB
  * 8 x B200
  * 8 x RTX PRO 6000
  * 5 x H100-80GB (with Multi-Instance GPU)
  * 
  * 
  * 
  * Optional GPU-backed services increase the requirement. Plan for one additional GPU for each optional service that you enable, such as VLM generation, VLM captioning, VLM reranking, Nemotron Parse, or audio processing, unless you use MIG slicing or another explicit sharing strategy.
  * 
  * 
  * The blueprint allows for use of NVIDIA-hosted NIM endpoints. Local GPU requirements apply when self-hosting NIM microservices or enabling optional GPU-accelerated vector database features.
  * OS Requirements
  * Ubuntu 22.04 OS
  * Deployment Options
  * Docker
  * Kubernetes with Helm or NIM Operator
  * Red Hat OpenShift with Helm

---


## 8. PDF to Podcast

### 8.1 Technical Objective
Transforms dense document text formats into an audio podcast discussing the content.

### 8.2 System Architecture & Container Topology

```mermaid
graph TD
    PDF["Upload PDF Document"] -->|1. Ingest| Parser["nemoretriever-parse"]
    Parser -->|2. Structured plain text| ScriptGen["Script Generator (nemotron-3-ultra-550b)"]
    ScriptGen -->|3. Two-person dialogue script| TTS["Riva TTS (Magpie Zero-Shot)"]
    TTS -->|4. Voice audio tracks| AudioEngine["Audio Mixer (Audiosync)"]
    AudioEngine -->|5. Integrated audio| Podcast["MP3 Podcast File"]
```

### 8.3 Container Specifications & Environment Variables
*   **`script-generator-nim`**: Generates a conversational podcast script.
*   **`riva-magpie-tts`**: Generates voices for multiple speakers.

```yaml
PODCAST:
  SPEAKER_1_VOICE: "en_us_male_magpie"
  SPEAKER_2_VOICE: "en_us_female_magpie"
  OUTPUT_FORMAT: "MP3"
```

### 8.4 Step-by-Step Pipeline Flow
1.  **PDF Parsing**: Document text and tables are extracted by `nemoretriever-parse`.
2.  **Script Generation**: `nemotron-3-ultra-550b-a55b` writes a conversational script based on the document.
3.  **Audio Synthesis**: The script is synthesized into separate audio tracks using `riva-magpie-tts`.
4.  **Audio Mixing**: The tracks are mixed and compiled into an MP3 file.

### 8.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/podcast/generate`
*   **Request JSON**:
    ```json
    {
      "pdf_path": "/data/reports/market_overview.pdf",
      "podcast_title": "Market Insights",
      "duration_target_minutes": 5
    }
    ```
*   **Response JSON**:
    ```json
    {
      "task_id": "pod_task_004",
      "status": "completed",
      "audio_file_url": "http://localhost:8086/static/podcasts/market_insights.mp3"
    }
    ```

### System Prerequisites & Minimum Requirements
*   **General**:
  * There are two ways of running this blueprint.
  * NVIDIA Hosted-endpoints: All model inference is performed on NVIDIA's cloud infrastructure.
  * NVIDIA RTX AI PCs and Workstations: Current support includes NVIDIA GeForce RTX 4090, GeForce RTX 5090, or NVIDIA RTX 6000 Ada GPUs.

---


## 9. Video Search and Summarization (VSS) Agent

### 9.1 Technical Objective
Ingests video streams or video archives, extracts layouts, and allows semantic search of video timelines.

### 9.2 System Architecture & Container Topology

```mermaid
graph TD
    Video["Video Streams / Archives"] -->|1. Stream frames| Processing["Cosmos Video Ingest Node"]
    Processing -->|2. Frame sequences| VLM["cosmos-reason2-8b VLM NIM"]
    VLM -->|3. Frame captions & events| DB[("Video Metadata Database")]
    User["Search: 'Find red truck turning left'"] -->|4. Search query| DB
    DB -->|5. Matching frame offsets| Video
```

### 9.3 Container Specifications & Environment Variables
*   **`cosmos-video-ingest`**: Segments video archives into sequence frames.
*   **`cosmos-vlm-nim`**: Vision-Language model generating semantic descriptions.

```yaml
VSS:
  METADATA_STORE: "sqlite:///data/video_metadata.db"
  FRAME_INTERVAL: "10"
```

### 9.4 Step-by-Step Pipeline Flow
1.  **Ingestion**: Videos are split into segments.
2.  **Captioning**: The `cosmos-reason2-8b` VLM generates text descriptions for the frame sequences.
3.  **Indexing**: The text descriptions and timestamps are written to the database.
4.  **Querying**: The user query is matched against the database to return relevant timestamps.

### 9.5 API Schema & JSON Payload
*   **Endpoint**: `POST http://localhost:8086/v1/vss/search`
*   **Request JSON**:
    ```json
    {
      "video_id": "vid_cam_south_02",
      "search_query": "person wearing yellow helmet",
      "confidence_cutoff": 0.7
    }
    ```
*   **Response JSON**:
    ```json
    {
      "matches": [
        {
          "timestamp_seconds": 122.5,
          "preview_url": "http://localhost:8086/static/previews/vid_cam_south_02_122.jpg",
          "description": "A worker in a yellow safety helmet walks across the platform."
        }
      ]
    }
    ```

### System Prerequisites & Minimum Requirements
*   **Core engine**:
  * The core video search and summarization blueprint pipeline supports the following hardware:
  * RTX Pro 6000 WS/SE
  * DGX Spark
  * Jetson Thor
  * B200
  * H200
  * H100
  * A100
  * L40/L40S
  * A6000
*   **Hosted NIMs**:
  * NVIDIA-Nemotron-Nano-9B-v2 requires the following minimum GPU configuration based on this support matrix.
  * Cosmos Reason 2 VLM requires 1xL40s as a minimum GPU.
*   **Minimum Local Deployment Configuration**:
  * The following configurations have been validated as minimal, local deployments.
  * 1 x RTX Pro 6000 WS/SE/DGX Spark/Jetson Thor/B200/H100/H200/A100 (80 GB)
  * 4 x L40/L40S/A6000
