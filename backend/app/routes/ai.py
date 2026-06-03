"""POST /api/ai/chat — Claude case-context assistant proxy.

The frontend AI dock (components/scan/AIAssistantDock) and the patient mobile
app (pages/PatientApp) call this endpoint. It builds a doctor- or patient-
persona system prompt, injects the per-case context the frontend computed,
and forwards to the Anthropic Claude API.

Auth: requires a logged-in user (re-uses the existing JWT dependency).
Config: reads ANTHROPIC_API_KEY from `DENTAL_ANTHROPIC_API_KEY` env var (see
config.py). When the key is empty the endpoint returns a stub reply so the
UI keeps working without a live key.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import get_current_user
from ..models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


# ── request / response shapes ──────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    context: str = Field(..., description="Pre-computed case context (one-line summary).")
    mode: Literal["doctor", "patient"] = "doctor"
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    model: str
    stub: bool = False


# ── persona prompts ────────────────────────────────────────────────────────


DOCTOR_PERSONA = (
    "당신은 치주과 임상 의사입니다. 동료 의사의 질문에 답변하듯 답하세요.\n\n"
    "환자는 30 kHz 탄성파 비침습 치은 스크리닝을 받았으며, "
    "베이지안 역산(MCMC)으로 추정된 병변 위치·심각도가 보고된 상태입니다.\n\n"
    "응답 원칙:\n"
    "- 평문 문단으로 답합니다. 마크다운(**, *, #, -, `, 헤딩, 리스트) 사용 금지.\n"
    "- 글머리표/불릿 형태(번호 매김 포함) 사용 금지. 모든 답은 흐르는 문단.\n"
    "- 인사말, 자기소개, '제가 보기에는', 면책 문구, AI라는 언급 모두 생략. 본론부터 시작.\n"
    "- 정량 지표(severity %, R̂, ESS, 잔차, 추정 좌표)를 자연스럽게 문장에 녹여 인용.\n"
    "- AAP/EFP staging(I–IV)·grading(A/B/C), PPD, CAL, BOP 같은 표준 임상 용어를 그대로 사용.\n"
    "- 단정 금지: '시사한다', '가능성이 있다', '추가 확인이 필요하다'로 추론임을 표시.\n"
    "- 감별진단을 묻는 경우 2~3개를 우선순위와 함께 한 문단으로 나열.\n"
    "- 길이는 짧게: 본문 3~6문장. 질문에 정확히 답하는 데 필요한 만큼만.\n"
    "- 한국어. 의학 용어는 한자어 우선, 필요 시 영문 병기."
)

PATIENT_PERSONA = (
    "당신은 치과 진료 결과를 환자에게 설명하는 임상 코디네이터입니다.\n\n"
    "응답 원칙:\n"
    "- 평문 문단으로만 답합니다. 마크다운(**, *, #, -, 헤딩, 리스트) 사용 금지.\n"
    "- 한국어 존댓말, 차분하고 명확하게.\n"
    "- 전문용어는 풀어서, 비유는 1개 이내로 절제.\n"
    "- 사실을 왜곡하지 말되 불안을 키우지 않습니다.\n"
    "- 분량 3~5문장. 마지막 한 문장은 권장 다음 행동.\n"
    "- 단정적 진단·처방 금지. 최종 판단은 담당의 상담을 안내.\n"
    "- AI 자기소개·면책 문구 생략. 본론부터 답하세요."
)

DISCLAIMER = (
    "출력 규칙: 마크다운 강조(**bold**, *italic*), 헤딩(#), 코드 블록, 글머리표 모두 사용 금지. "
    "평문 한국어 문단으로만 답하세요. 본론부터 바로 시작."
)


def _system_prompt(mode: str, context: str) -> str:
    persona = PATIENT_PERSONA if mode == "patient" else DOCTOR_PERSONA
    return f"{persona}\n\n[케이스 컨텍스트]\n{context}\n\n[안내]\n{DISCLAIMER}"


# ── stub fallback ──────────────────────────────────────────────────────────


def _stub_reply(req: ChatRequest) -> str:
    who = "환자" if req.mode == "patient" else "의사"
    return (
        f"**(stub · DENTAL_ANTHROPIC_API_KEY 미설정)** {who} 모드 응답 예시\n\n"
        f"**질문**: {req.question}\n\n"
        f"**케이스 요약**: {req.context[:200]}…\n\n"
        "- 실제 응답은 Anthropic Claude API에 연결되면 케이스 컨텍스트를 반영해 답합니다.\n"
        "- `export DENTAL_ANTHROPIC_API_KEY=sk-ant-...` 후 백엔드 재시작 시 라이브 응답으로 전환됩니다."
    )


# ── endpoint ───────────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    _user: User = Depends(get_current_user),
) -> ChatResponse:
    # No key configured → return stub so the dock UI keeps working in dev.
    if not settings.anthropic_api_key:
        return ChatResponse(reply=_stub_reply(req), model="(stub)", stub=True)

    try:
        # Lazy import so the server still boots when the `anthropic` package
        # isn't installed (the stub path doesn't need it).
        from anthropic import Anthropic
    except ImportError as exc:  # noqa: BLE001
        logger.warning("anthropic package not installed: %s", exc)
        return ChatResponse(
            reply=_stub_reply(req) + "\n\n— `anthropic` 패키지가 설치되지 않았습니다. `pip install anthropic`",
            model="(stub)",
            stub=True,
        )

    client = Anthropic(api_key=settings.anthropic_api_key)
    messages = [
        {"role": m.role, "content": m.content} for m in req.history
    ]
    messages.append({"role": "user", "content": req.question})

    try:
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=settings.anthropic_max_tokens,
            system=_system_prompt(req.mode, req.context),
            messages=messages,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Claude API call failed")
        msg = str(exc)
        # Map common Anthropic errors to friendly Korean messages so the dock
        # surfaces an actionable hint rather than a raw traceback.
        if "credit balance is too low" in msg.lower():
            friendly = "Anthropic 계정 잔액이 부족합니다. console.anthropic.com 빌링에서 크레딧을 충전해주세요."
            raise HTTPException(status_code=402, detail=friendly) from exc
        if "authentication" in msg.lower() or "invalid_api_key" in msg.lower():
            raise HTTPException(status_code=401, detail="Claude API 키 인증 실패. 키를 확인해주세요.") from exc
        if "rate_limit" in msg.lower() or "rate limit" in msg.lower():
            raise HTTPException(status_code=429, detail="Claude API 요청 한도 초과. 잠시 후 다시 시도해주세요.") from exc
        raise HTTPException(status_code=502, detail=f"Claude API 오류: {msg[:200]}") from exc

    # Concatenate any text blocks Claude returns (typically one).
    text_parts: list[str] = []
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(getattr(block, "text", ""))
    reply = "".join(text_parts).strip() or "(빈 응답)"

    return ChatResponse(reply=reply, model=settings.anthropic_model)
