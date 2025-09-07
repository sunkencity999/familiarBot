# VLLM Integration Guide

This guide explains how to integrate local VLLM models with your FamiliarBot application via FastAPI endpoints.

## Overview

The application now supports automatic discovery and integration of VLLM models running on local FastAPI servers with OpenAI-compatible endpoints. Models are automatically discovered and listed alongside other AI providers in the UI.

## Setup Instructions

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# VLLM FastAPI endpoint (required)
VLLM_BASE_URL=http://localhost:8000/v1

# Optional API key if your VLLM server requires authentication
VLLM_API_KEY=your_api_key_here
```

### 2. VLLM Server Setup

Start your VLLM server with FastAPI and OpenAI-compatible endpoints:

```bash
# Example VLLM server command
python -m vllm.entrypoints.openai.api_server \
    --model microsoft/DialoGPT-medium \
    --host 0.0.0.0 \
    --port 8000 \
    --served-model-name my-local-model
```

### 3. Docker Compose Configuration

If using Docker, the environment variables are already configured in `docker-compose.proxy.yml`. Just set them in your `.env` file:

```bash
# In your docker/.env file
VLLM_BASE_URL=http://host.docker.internal:8000/v1
VLLM_API_KEY=optional_api_key
```

## How It Works

### Model Discovery

1. **Automatic Detection**: When the application starts, it automatically queries your VLLM endpoint at `/v1/models`
2. **Model Listing**: Discovered models appear in the UI with the prefix "VLLM:" 
3. **Fallback Handling**: If the VLLM server is unavailable, the application continues to work with other providers

### API Integration

- **OpenAI Compatibility**: Uses the standard OpenAI chat completions format
- **Tool Support**: Supports function calling and computer use tools
- **Context Management**: Automatically handles context windows and token limits
- **Error Handling**: Graceful fallback if VLLM server becomes unavailable

### Model Selection

Models from your VLLM server will appear in the model dropdown with:
- **Provider**: `vllm`
- **Title**: `VLLM: {model_name}`
- **Context Window**: Detected from model metadata or defaults to 32,768 tokens

## Testing the Integration

### 1. Start VLLM Server

```bash
# Install VLLM if not already installed
pip install vllm

# Start the server
python -m vllm.entrypoints.openai.api_server \
    --model microsoft/DialoGPT-medium \
    --host 0.0.0.0 \
    --port 8000
```

### 2. Configure Environment

```bash
# Set the environment variable
export VLLM_BASE_URL=http://localhost:8000/v1

# Or add to your .env file
echo "VLLM_BASE_URL=http://localhost:8000/v1" >> docker/.env
```

### 3. Start FamiliarBot

```bash
# Using Docker Compose
docker-compose -f docker/docker-compose.proxy.yml up -d

# Check logs to verify VLLM integration
docker logs bytebot-agent
```

### 4. Verify Integration

1. Open the FamiliarBot UI at `http://localhost:9992`
2. Create a new task
3. In the model dropdown, look for models prefixed with "VLLM:"
4. Select a VLLM model and create a task

## Troubleshooting

### VLLM Server Not Detected

If VLLM models don't appear in the dropdown:

1. **Check Server Status**: Ensure your VLLM server is running and accessible
   ```bash
   curl http://localhost:8000/v1/models
   ```

2. **Verify Environment Variables**: Check that `VLLM_BASE_URL` is correctly set

3. **Check Logs**: Look at the agent logs for VLLM-related messages
   ```bash
   docker logs bytebot-agent | grep -i vllm
   ```

### Authentication Issues

If your VLLM server requires authentication:

1. Set the `VLLM_API_KEY` environment variable
2. Ensure your VLLM server is configured to accept the API key

### Network Connectivity

For Docker deployments:

- Use `host.docker.internal:8000` instead of `localhost:8000` for the VLLM_BASE_URL
- Ensure the VLLM server is accessible from within the Docker network

## Advanced Configuration

### Custom Model Names

You can customize how models appear in the UI by configuring your VLLM server with specific model names:

```bash
python -m vllm.entrypoints.openai.api_server \
    --model microsoft/DialoGPT-medium \
    --served-model-name "Custom-Chat-Model" \
    --host 0.0.0.0 \
    --port 8000
```

### Multiple VLLM Servers

Currently, the system supports one VLLM endpoint. To use multiple VLLM servers, you can:

1. Use a load balancer or proxy to aggregate multiple VLLM servers
2. Run multiple instances of the application with different configurations
3. Extend the code to support multiple VLLM_BASE_URL variables

### Performance Optimization

- **Context Window**: Ensure your VLLM server reports accurate `max_model_len` values
- **Batch Size**: Configure VLLM server batch sizes for optimal performance
- **GPU Memory**: Allocate sufficient GPU memory for your models

## API Endpoints

The integration adds VLLM model discovery to the existing `/tasks/models` endpoint:

```bash
# Get all available models (including VLLM)
curl http://localhost:9991/tasks/models

# Response includes VLLM models:
[
  {
    "provider": "vllm",
    "name": "microsoft/DialoGPT-medium",
    "title": "VLLM: microsoft/DialoGPT-medium",
    "contextWindow": 32768
  }
]
```

## Security Considerations

- **Network Access**: Ensure VLLM servers are only accessible from trusted networks
- **API Keys**: Use strong API keys and rotate them regularly
- **Firewall**: Configure firewalls to restrict access to VLLM endpoints
- **Monitoring**: Monitor VLLM server access logs for suspicious activity

## Support

For issues specific to VLLM integration:

1. Check the application logs for error messages
2. Verify VLLM server compatibility with OpenAI API format
3. Test the VLLM endpoint directly with curl or similar tools
4. Ensure network connectivity between FamiliarBot and VLLM server
