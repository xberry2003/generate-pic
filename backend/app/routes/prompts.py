from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.prompt_expander import ExpandOptions, expand_prompt

router = APIRouter()


class ExpandPromptRequest(BaseModel):
    prompt: str
    style: str = "realistic"
    aspect: str = "default"


class ExpandPromptResponse(BaseModel):
    originalPrompt: str
    expandedPrompt: str


@router.post("/prompts/expand", response_model=ExpandPromptResponse)
async def expand_prompt_route(request: ExpandPromptRequest):
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    expanded = expand_prompt(prompt, ExpandOptions(style=request.style, aspect=request.aspect))
    return ExpandPromptResponse(originalPrompt=prompt, expandedPrompt=expanded)
