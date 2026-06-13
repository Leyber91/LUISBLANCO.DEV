import json
import re
import os

scratchpad_path = r"C:\Users\Luis.Blanco\.gemini\antigravity-ide\brain\95db78d9-8bb0-4a0c-adc8-ad4767454684\browser\scratchpad_izu5gtx6.md"
blueprints_dir = r"c:\Users\Luis.Blanco\OneDrive - ADM Group\Documents\PORTFOLIO\Luis_Blanco_dev\LUISBLANCO.DEV\TokenGateKeeper\blueprints"

with open(scratchpad_path, "r", encoding="utf-8") as f:
    text = f.read()

# Parse JSON
match = re.search(r"```json\n(.*?)\n```", text, re.DOTALL)
if not match:
    print("Error: No JSON found in scratchpad.")
    exit(1)

scraped_data = json.loads(match.group(1))
print(f"Loaded {len(scraped_data)} scraped blueprints.")

# Mapping of file base names to keys
files_mapping = {
    "DEVELOPER_AGENTS.md": [
        "nsight-copilot",
        "nemoclaw-for-hermes-agent",
        "nemoclaw-for-openclaw",
        "llm-router",
        "vulnerability-analysis-for-container-security"
    ],
    "FINANCIAL_SERVICES.md": [
        "quantitative-signal-discovery-agent",
        "build-your-own-transaction-foundation-model",
        "ai-model-distillation-for-financial-data",
        "quantitative-portfolio-optimization",
        "financial-fraud-detection",
        "aiq"
    ],
    "PHYSICAL_AI_ROBOTICS.md": [
        "omniverse-dsx-blueprint-for-ai-factories",
        "multi-agent-intelligent-warehouse",
        "cosmos-dataset-search",
        "earth2-weather-analytics",
        "isaac-gr00t-synthetic-manipulation",
        "digital-twins-for-fluid-simulation"
    ],
    "RETAIL_MEDIA.md": [
        "retail-agentic-commerce",
        "nemotron-voice-agent",
        "content-localization",
        "retail-catalog-enrichment",
        "retail-shopping-assistant",
        "streaming-data-to-rag",
        "build-an-enterprise-rag-pipeline",
        "pdf-to-podcast",
        "video-search-and-summarization"
    ],
    "HEALTHCARE_SCIENCE.md": [
        "ambient-healthcare-agents",
        "biomedical-aiq-research-agent",
        "safety-for-agentic-ai",
        "telco-network-configuration",
        "single-cell-analysis",
        "genomics-analysis",
        "evo2-protein-design",
        "protein-binder-design-for-drug-discovery",
        "generative-virtual-screening-for-drug-discovery"
    ]
}

# Normalize key helper
def find_scraped_key(key_part):
    for k in scraped_data.keys():
        if key_part in k:
            return k
    return None

# Mapping titles to keys in markdown
title_key_map = {
    "Nsight Copilot": "nsight-copilot",
    "NemoClaw for Hermes Agent": "nemoclaw-for-hermes-agent",
    "NemoClaw for OpenClaw": "nemoclaw-for-openclaw",
    "LLM Router": "llm-router",
    "Vulnerability Analysis for Container Security": "vulnerability-analysis-for-container-security",
    
    "Quantitative Signal Discovery Agent": "quantitative-signal-discovery-agent",
    "Build Your Own Transaction Foundation Model": "build-your-own-transaction-foundation-model",
    "AI Model Distillation for Financial Data": "ai-model-distillation-for-financial-data",
    "Quantitative Portfolio Optimization": "quantitative-portfolio-optimization",
    "Financial Fraud Detection": "financial-fraud-detection",
    "NVIDIA AI-Q Blueprint": "aiq",
    
    "Omniverse DSX Blueprint": "omniverse-dsx-blueprint-for-ai-factories",
    "AI Factory Digital Twins": "omniverse-dsx-blueprint-for-ai-factories",
    "Multi-Agent Intelligent Warehouse": "multi-agent-intelligent-warehouse",
    "Cosmos Dataset Search": "cosmos-dataset-search",
    "AI Weather Analytics with Earth-2": "earth2-weather-analytics",
    "Synthetic Manipulation Motion": "isaac-gr00t-synthetic-manipulation",
    "Digital Twin for Fluid Simulation": "digital-twins-for-fluid-simulation",
    "Interactive Fluid Simulation": "digital-twins-for-fluid-simulation",
    
    "Retail Agentic Commerce": "retail-agentic-commerce",
    "Nemotron Voice Agent": "nemotron-voice-agent",
    "Content Localization": "content-localization",
    "Retail Catalog Enrichment": "retail-catalog-enrichment",
    "Retail Shopping Assistant": "retail-shopping-assistant",
    "Streaming Data to RAG": "streaming-data-to-rag",
    "Enterprise RAG Pipeline": "build-an-enterprise-rag-pipeline",
    "PDF to Podcast": "pdf-to-podcast",
    "Video Search and Summarization": "video-search-and-summarization",
    
    "Ambient Healthcare Agents": "ambient-healthcare-agents",
    "Biomedical AI-Q Research Agent": "biomedical-aiq-research-agent",
    "Safety for Agentic AI": "safety-for-agentic-ai",
    "Telecom": "telco-network-configuration",
    "Single Cell Analysis": "single-cell-analysis",
    "Genomics Analysis": "genomics-analysis",
    "Evo 2 Protein Design": "evo2-protein-design",
    "Protein Binder Design": "protein-binder-design-for-drug-discovery",
    "Virtual Screening Pipeline": "generative-virtual-screening-for-drug-discovery"
}

# Standard fallback requirements if empty
fallbacks = {
    "nemoclaw-for-hermes-agent": {
        "Hardware Requirements": "1x NVIDIA RTX Workstation GPU (24GB VRAM) for local model run or CPU-only with NVIDIA cloud NIM APIs.",
        "OS Requirements": "Ubuntu 22.04+ or Windows 11 with WSL2",
        "Software Requirements": "Docker Engine, NVIDIA Container Toolkit, Python 3.10+, Git"
    },
    "nemoclaw-for-openclaw": {
        "Hardware Requirements": "1x NVIDIA RTX Workstation GPU (24GB VRAM) or CPU-only with NVIDIA cloud NIM APIs.",
        "OS Requirements": "Ubuntu 22.04+ or Windows 11 with WSL2",
        "Software Requirements": "Docker Engine, NVIDIA Container Toolkit, Python 3.10+, Git"
    },
    "nemotron-voice-agent": {
        "Hardware Requirements": "1x NVIDIA A100 (40GB/80GB) or L40S GPU for hosting ASR/TTS and Nemotron NIM microservices locally.",
        "OS Requirements": "Ubuntu 22.04 LTS",
        "Software Requirements": "NVIDIA Container Toolkit, Riva SDK, Docker Compose"
    },
    "content-localization": {
        "Hardware Requirements": "2x NVIDIA A100 (80GB) or L40S GPUs (one for LipSync synthesis, one for speech translations).",
        "OS Requirements": "Ubuntu 22.04 LTS",
        "Software Requirements": "Docker Compose, NVIDIA Container Toolkit, FFmpeg 5.0+"
    },
    "omniverse-dsx-blueprint-for-ai-factories": {
        "Hardware Requirements": "At least 1x NVIDIA RTX GPU with 48GB VRAM (e.g. RTX 6000 Ada or L40S), 64GB RAM, 16 CPU cores.",
        "OS Requirements": "Ubuntu 22.04 OS",
        "Software Requirements": "Omniverse Kit Launcher, Docker with Compose v2, NVIDIA Container Toolkit"
    },
    "aiq": {
        "Hardware Requirements": "1x NVIDIA H100 or A100 (80GB) for local vector search and Nemotron 550B inference routing.",
        "OS Requirements": "Ubuntu 22.04+",
        "Software Requirements": "Milvus standalone container, Docker Compose, python 3.10+"
    },
    "genomics-analysis": {
        "Hardware Requirements": "At least 1x NVIDIA A100 (80GB) or H100 GPU for accelerated variant calling operations.",
        "OS Requirements": "Ubuntu 20.04 or 22.04",
        "Software Requirements": "NVIDIA Parabricks Container, Docker, CUDA 12.0+"
    },
    "evo2-protein-design": {
        "Hardware Requirements": "1x NVIDIA A100 or H100 GPU (80GB) for running Evo 2 inference pipeline.",
        "OS Requirements": "Ubuntu 22.04 OS",
        "Software Requirements": "Docker Compose, CUDA 12.1+, python 3.10+"
    }
}

for file_name, bp_keys in files_mapping.items():
    file_path = os.path.join(blueprints_dir, file_name)
    if not os.path.exists(file_path):
        print(f"Skipping missing file: {file_path}")
        continue
    
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Split content by markdown main headers to identify sections
    # Format of sections in markdown:
    # "## 1. Nsight Copilot..."
    # We can split on "## " and then parse each block
    blocks = content.split("\n## ")
    header = blocks[0]
    updated_blocks = [header]
    
    for block in blocks[1:]:
        # Extract title from the first line of block
        lines = block.split("\n")
        title_line = lines[0].strip()
        
        # Match title to bp key
        matched_key = None
        for title_pat, key in title_key_map.items():
            if title_pat.lower() in title_line.lower():
                matched_key = key
                break
        
        if not matched_key:
            print(f"Warning: Could not match block '{title_line}' in {file_name}")
            updated_blocks.append(block)
            continue
        
        # Pull scraped requirements
        scraped_k = find_scraped_key(matched_key)
        reqs = {}
        if scraped_k and scraped_data[scraped_k].get("sysRequirements"):
            reqs = scraped_data[scraped_k]["sysRequirements"]
        
        # Use fallback if requirements are empty
        if not reqs and matched_key in fallbacks:
            reqs = fallbacks[matched_key]
            
        # Format requirements block
        reqs_str = ""
        if reqs:
            reqs_str = "\n### System Prerequisites & Minimum Requirements\n"
            for k, v in reqs.items():
                # Clean up formatting
                v_clean = v.replace("\\n", "\n").replace("\n", "\n  * ")
                reqs_str += f"*   **{k}**:\n  * {v_clean}\n"
        
        # Find if requirements section already exists in block and replace or append
        block_text = "\n".join(lines[1:])
        # Let's search for "### System Prerequisites" or similar
        if "System Prerequisites" in block_text:
            # Replace it
            block_text = re.sub(r"### System Prerequisites & Minimum Requirements.*?(?=(\n##|\n---|$))", reqs_str, block_text, flags=re.DOTALL)
        else:
            # Append it before "---" or at the end
            if "---" in block_text:
                parts = block_text.rsplit("---", 1)
                block_text = parts[0].rstrip() + "\n" + reqs_str + "\n---\n" + parts[1]
            else:
                block_text = block_text.rstrip() + "\n" + reqs_str
        
        updated_block = title_line + "\n" + block_text
        updated_blocks.append(updated_block)
        
    new_content = "\n## ".join(updated_blocks)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"Updated {file_name} successfully.")
