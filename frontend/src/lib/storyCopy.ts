// Korean editorial copy for the scrollytelling /story rebuild.
// Tone: 잡지 에세이, 단정적, 감각 메타포 OK, jargon dump 금지. 1인칭 복수 ("우리").
// Generated via copy subagent then human-reviewed.

export interface StoryActHero {
  value: string
  unit: string
  caption: string
}

export interface StoryAct {
  act_id: string
  kicker: string
  headline: string
  hero_number?: StoryActHero
  body: string[]
  pullquote?: string
  transition: string
}

// ── New: 6-step clinical scrollytelling (doctor/patient toggle) ─────────────
// Used by the rewritten StoryMode page. Original STORY_ACTS below is kept
// untouched for any other consumers (e.g. magazine-style read).

export type StoryAudience = 'doctor' | 'patient'

export interface StoryQA {
  q: string
  a: string
}

export interface StoryStepClinical {
  step_id: string
  kicker: string                  // e.g. "STEP 01 · 환자 케이스"
  headline_doc: string
  headline_pat: string
  hero?: { value: string; unit: string; caption_doc: string; caption_pat: string }
  body_doc: string[]              // technical Korean, jargon OK
  body_pat: string[]              // friendly Korean, analogies, no jargon
  callout_doc?: string            // small chip text (R̂, ESS, misfit ...)
  callout_pat?: string
  qa_doc: StoryQA                 // pre-canned "AI에게 물어보기" Q&A (doctor mode)
  qa_pat: StoryQA                 // patient mode
  viz_kind: 'patient' | 'pulse' | 'gather' | 'mcmc' | 'estimate' | 'clinical'
}

export const STORY_STEPS_CLINICAL: StoryStepClinical[] = [
  {
    step_id: 'step-01-case',
    kicker: 'STEP 01 · 환자 케이스',
    headline_doc: '왜 이 스캔이 의뢰되었는가',
    headline_pat: '오늘 검사를 받게 된 이유',
    hero: {
      value: '#16',
      unit: 'tooth',
      caption_doc: '우측 상악 제1대구치 · UR · FDI 16',
      caption_pat: '오른쪽 위 어금니 부위의 불편감',
    },
    body_doc: [
      '환자의 주소(chief complaint)는 우측 상악 어금니 부위의 잇몸 출혈 및 압통이었습니다. 30년 흡연력과 치주염 가족력은 임상적 의심도를 높입니다.',
      '기존 CBCT에서는 골소실이 명확치 않아 연조직 차원의 평가가 필요했고, 침습·방사선 노출 없이 잇몸 내부를 스크리닝할 수 있는 30 kHz 탄성파 검사가 적응증으로 선택되었습니다.',
    ],
    body_pat: [
      '잇몸에서 피가 자주 나고, 어금니 쪽이 욱신거린다는 말씀으로 진료가 시작되었습니다.',
      '엑스레이만으로는 잇몸 속이 잘 보이지 않아서, 오늘은 "소리로 듣는 청진기"처럼 작은 떨림으로 잇몸 안쪽을 살펴보기로 했습니다.',
    ],
    callout_doc: '비침습 · 0 mSv · 5분',
    callout_pat: '방사선 없이 안전한 검사',
    qa_doc: {
      q: '왜 CBCT가 아니고 탄성파 검사인가요?',
      a: 'CBCT는 골(석회화 조직) 영상에 강하지만 초기 연조직 변화(부종·콜라겐 분해)는 해상도가 낮습니다. 30 kHz 탄성파는 연조직의 전단파 속도(Vs) 변화를 직접 감지하므로 골소실 이전의 잇몸 변화를 잡아낼 수 있고, 방사선 노출 없이 반복 추적이 가능합니다.',
    },
    qa_pat: {
      q: '이 검사가 아픈가요?',
      a: '전혀 아프지 않습니다. 작은 진동자를 치아에 살짝 댈 뿐이고, 약 5분이면 끝납니다. 엑스레이도 사용하지 않아 임산부도 안전하게 받을 수 있어요.',
    },
    viz_kind: 'patient',
  },
  {
    step_id: 'step-02-pulse',
    kicker: 'STEP 02 · 30 kHz 탄성파 발사',
    headline_doc: 'Ricker 펄스 — 한 번의 떨림이 시작점이다',
    headline_pat: '아주 짧고 약한 진동을 한 번 보냅니다',
    hero: {
      value: '30',
      unit: 'kHz',
      caption_doc: 'Ricker wavelet · 33 μs 폭 · 단일 shot',
      caption_pat: '귀에 들리지 않는 높은 음의 진동',
    },
    body_doc: [
      '치아 표면에 30 kHz 중심 주파수의 Ricker 펄스를 단일 shot으로 인가합니다. 의료 초음파(1–20 MHz) 대비 100배 이상 낮은 주파수로, 잇몸·골 깊이의 경계 정보를 손실 없이 얻기에 유리합니다.',
      '파동은 법랑질을 통과하며 거의 즉시 굴절·분기되고, 인접 조직의 음향 임피던스 차이에서 1차 반사를 만듭니다. 이 시점부터 75 μs 동안의 표면 변위가 우리가 측정할 모든 정보입니다.',
    ],
    body_pat: [
      '치아에 아주 짧은 "톡" 하는 진동을 한 번 줍니다. 귀에는 들리지 않는 높은 음이에요.',
      '이 떨림이 잇몸 안쪽으로 퍼져나가면서, 단단한 곳과 부드러운 곳을 지날 때마다 모양이 조금씩 바뀝니다. 그 바뀐 모양을 우리가 듣게 됩니다.',
    ],
    callout_doc: 'misfit 기준 = L2(obs − sim)',
    callout_pat: '엑스레이보다 안전한 소리',
    qa_doc: {
      q: 'Ricker 펄스를 쓰는 이유가 있나요?',
      a: 'Ricker(=2차 가우시안 미분)는 주파수 대역이 좁고 시간 도메인에서 컴팩트해 도달시간을 명확히 측정할 수 있습니다. 단일 펄스 응답으로 임피던스 경계의 위치 정보를 잘 보존하고, 역산 시 forward 모델과의 misfit 평가가 안정적입니다.',
    },
    qa_pat: {
      q: '이 진동이 치아에 해롭지 않나요?',
      a: '진폭이 매우 작아 치아나 잇몸에 어떤 손상도 주지 않습니다. 매일 칫솔질할 때 받는 힘보다도 훨씬 작은 자극이라 안심하셔도 됩니다.',
    },
    viz_kind: 'pulse',
  },
  {
    step_id: 'step-03-receivers',
    kicker: 'STEP 03 · 100채널 수신',
    headline_doc: '치열궁 100개 센서가 듣는 0.3 ms',
    headline_pat: '백 개의 작은 귀가 잇몸의 떨림을 듣습니다',
    hero: {
      value: '100',
      unit: 'ch',
      caption_doc: 'arch 정렬 · 75,000 timestep · DT 0.004 μs',
      caption_pat: '잇몸 곡선을 따라 늘어선 100개 센서',
    },
    body_doc: [
      '치열궁(arch)에 정렬된 100개의 수신기가 75,000 timestep, 약 0.3 ms 동안 표면 변위를 동시 기록합니다. 각 채널의 진폭·도달시간 차이가 곧 지하의 음향 구조를 디코딩하는 1차 관측치(observation)입니다.',
      '단일 시점의 진폭은 잡음에 민감하므로, 수신기 게더(seismogram)는 시간축을 따라 전체 75 μs를 적분해 잡음을 억제합니다. 본 케이스의 잔차 최대 수신기는 #47이며, 이 위치가 1차 hotspot 후보가 됩니다.',
    ],
    body_pat: [
      '잇몸 곡선을 따라 100개의 아주 작은 "귀"가 늘어서 있다고 상상해 보세요. 이 귀들이 동시에 떨림을 듣습니다.',
      '한 곳에서만 들으면 우연인지 진짜인지 알기 어렵지만, 100곳이 함께 들으면 어디에 "다른 소리"가 있는지 훨씬 정확하게 짚어낼 수 있습니다.',
    ],
    callout_doc: 'peak rx #47 · 잔차 최대',
    callout_pat: '여러 방향에서 함께 듣는 청진기',
    qa_doc: {
      q: '왜 한 채널만으로는 부족한가요?',
      a: '단일 채널은 표면 반사·바닥파(surface wave) 등 우세 모드에 묻혀 미세한 산란체 신호를 분리하기 어렵습니다. 여러 채널의 진폭·위상 차이를 결합(beam-forming/migration)하면 SNR이 채널 수의 제곱근만큼 개선되고, 산란체의 공간 좌표를 추정할 수 있습니다.',
    },
    qa_pat: {
      q: '센서가 어떻게 100개나 들어가요?',
      a: '실제로는 잇몸 곡선을 따라 얇은 띠 모양의 센서 패드가 한 줄로 자리잡습니다. 입을 살짝 벌리기만 하면 되고, 검사 후 바로 떼어낼 수 있어요.',
    },
    viz_kind: 'gather',
  },
  {
    step_id: 'step-04-mcmc',
    kicker: 'STEP 04 · 베이지안 역산',
    headline_doc: 'MCMC — 천 번의 가설, 한 자리로 수렴',
    headline_pat: '천 번 다시 추측해서 가장 그럴듯한 자리를 찾습니다',
    hero: {
      value: '1,000',
      unit: 'iter',
      caption_doc: 'Metropolis-Hastings · accept ≈ 41% · R̂ 1.012 · ESS 247',
      caption_pat: '컴퓨터가 천 번 자리를 옮겨가며 맞춰봄',
    },
    body_doc: [
      '병변의 (x, y, z, 반지름)에 사전분포를 두고, 매 iteration마다 forward 시뮬레이션의 misfit으로 우도를 계산해 Metropolis-Hastings로 수용/기각을 결정합니다. 1,000 iter · 4 chain 기준 R̂ ≤ 1.05, ESS ≥ 200이 수렴 판정 기준입니다.',
      '단일 점추정이 아니라 사후분포 전체를 얻는 것이 핵심입니다. 신뢰구간·credible region은 곧 모델 불확실성의 정량화이며, 이 정보가 임상의에게 "얼마나 확신할 수 있는가"의 근거를 제공합니다.',
    ],
    body_pat: [
      '컴퓨터가 "여기 있을까?", "아니, 여기?" 하면서 천 번 자리를 옮겨가며 가장 그럴듯한 위치를 찾아갑니다.',
      '한 번에 답을 정하지 않고 여러 번 확인하는 이유는, 한 점만 찍으면 틀릴 위험이 있기 때문이에요. 천 번을 모아 보면 "여기쯤이라고 얼마나 확신하는지"까지 알 수 있습니다.',
    ],
    callout_doc: 'R̂ 1.012 · ESS 247 · misfit 3.2e-3',
    callout_pat: '천 번 모아본 답',
    qa_doc: {
      q: 'R̂와 ESS는 어떻게 해석해야 하나요?',
      a: 'R̂는 split-half potential scale reduction — 체인 간 분산 / 체인 내 분산의 비입니다. ≤1.05면 충분히 섞였다고 봅니다. ESS(effective sample size)는 자기상관을 보정한 독립 표본 수로, 1,000 iter 중 247이면 약 25%의 실효 표본을 얻은 것이라 분포 추정에 충분합니다.',
    },
    qa_pat: {
      q: '한 번에 답을 안 내는 이유가 뭔가요?',
      a: '한 번만 측정하면 우연히 틀릴 수 있어요. 천 번 다른 자리를 시험해보고 그 결과를 모아서 보면, "여기일 확률이 가장 높다"는 결론과 함께 "얼마나 확신하는지"까지 알 수 있습니다. 의사 선생님이 판단하실 때 더 정확한 정보가 됩니다.',
    },
    viz_kind: 'mcmc',
  },
  {
    step_id: 'step-05-estimate',
    kicker: 'STEP 05 · 병변 위치 추정',
    headline_doc: '추정 위치 — 실제와 0.21 mm 떨어진 곳',
    headline_pat: '머리카락 두 가닥 굵기만큼의 오차로 자리를 짚었습니다',
    hero: {
      value: '0.21',
      unit: 'mm',
      caption_doc: '|mode − GT| ≈ 2 voxel · severity 89%',
      caption_pat: '실제 자리와 거의 같은 곳',
    },
    body_doc: [
      '사후분포의 mode 기준 추정 좌표는 (24.8, 32.3, 0.9) mm — ground truth와 격자 단위 약 2 voxel(0.21 mm) 차이입니다. severity score는 89%로 PROBABLE LESION 구간에 해당합니다.',
      '판정은 0/20/50/80% 임계값으로 NEGATIVE → EQUIVOCAL → SUSPICIOUS → PROBABLE LESION의 4단 등급으로 표기됩니다. 본 케이스는 최상위 등급이며, 임상 검진과의 교차 확인이 필요합니다.',
    ],
    body_pat: [
      '컴퓨터가 짚어낸 자리는 실제 의심 부위와 머리카락 두 가닥 정도밖에 차이가 나지 않았어요.',
      '결과는 "병변 가능성 높음"으로 나왔습니다. 이는 검사 결과일 뿐이고, 실제 진단은 담당 의사 선생님이 직접 확인한 뒤 내려집니다.',
    ],
    callout_doc: 'PROBABLE LESION · 89% severity',
    callout_pat: '추가 진료가 필요한 결과',
    qa_doc: {
      q: '0.21 mm 오차의 임상적 의미는 무엇인가요?',
      a: '치주조직의 임상적 의사결정 단위(예: 프로빙 깊이 1 mm 변화, 골소실 단계 구분)에 비해 5배 이상 정밀한 수준입니다. 위치 정확도가 충분히 작아 다음 단계의 표적 검진 또는 부위별 처치 계획에 직접 사용할 수 있습니다.',
    },
    qa_pat: {
      q: '병변 가능성 높음이라는 결과는 무슨 뜻인가요?',
      a: '검사상 잇몸 안쪽에 염증이 있을 가능성이 높다는 뜻이에요. 다만 이것만으로 진단이 끝난 건 아니고, 의사 선생님이 직접 보고 만져 확인한 뒤 치료 계획을 세우게 됩니다. 너무 걱정하지 마시고 다음 진료에서 자세히 상의해 주세요.',
    },
    viz_kind: 'estimate',
  },
  {
    step_id: 'step-06-clinical',
    kicker: 'STEP 06 · 임상 적용',
    headline_doc: '다음 단계 — 검진 · 치료 · 추적',
    headline_pat: '앞으로 어떻게 진행되나요',
    hero: {
      value: '3',
      unit: 'step',
      caption_doc: '전문의 의뢰 → 임상 검진 → 4주 추적',
      caption_pat: '진료 → 치료 → 다시 검사',
    },
    body_doc: [
      '권고 사항: (1) 치주과 전문의 의뢰 및 정밀 검사 계획 수립, (2) 해당 부위 프로빙 깊이·BOP·치은 지수 측정, (3) 4주 후 추적 스캔으로 진행 양상 평가.',
      '최종 판단은 면허 의사의 직접 검진에 따라야 합니다. 환자 동의·치료 결정은 담당의의 책임입니다.',
    ],
    body_pat: [
      '담당 의사 선생님께서 잇몸 상태를 직접 확인하시고, 필요한 치료(예: 잇몸 스케일링, 약물 치료)를 안내해 주실 거예요.',
      '한 달쯤 뒤에 다시 한 번 이 검사를 받아서 잘 나아지고 있는지 확인합니다. 그동안 칫솔질을 부드럽게 자주 해 주시고, 흡연은 가능하면 줄여주세요.',
    ],
    callout_doc: '면허 의사 검진 권장',
    callout_pat: '담당 의사와 함께',
    qa_doc: {
      q: '본 시스템의 임상 도입 한계는 무엇인가요?',
      a: '현재는 단일 스캔의 위치 추정에 한정되며, 종단적 변화(progression) 모델·다중 병변 동시 추정·환자 간 prior 학습은 후속 과제입니다. 또한 forward 시뮬레이션의 조직 파라미터는 문헌치 기반이라 환자별 calibration이 필요할 수 있습니다.',
    },
    qa_pat: {
      q: '치료를 안 받으면 어떻게 되나요?',
      a: '잇몸 염증을 그대로 두면 시간이 지나면서 잇몸이 내려앉고, 심하면 치아가 흔들리거나 빠질 수 있어요. 다행히 초기에 발견했기 때문에 지금부터 치료를 잘 받으시면 충분히 회복할 수 있습니다.',
    },
    viz_kind: 'clinical',
  },
]

export const STORY_ACTS: StoryAct[] = [
  {
    act_id: 'act-01-input',
    kicker: 'ACT 01 · 입력',
    headline: '우리는 입 안을 격자로 옮겼다',
    hero_number: { value: '415 × 308 × 17', unit: 'voxel', caption: '한 사람의 구강을 담은 격자' },
    body: [
      'CBCT 한 장과 구강 스캐너의 STL 한 벌. 우리에게 주어진 것은 이 두 개의 좌표계뿐이었다. 단단한 뼈와 부드러운 잇몸, 그리고 그 사이의 경계가 0.1 mm 단위로 맞물려야 했다.',
      '정합은 의외로 조용한 작업이다. 두 좌표계가 서로의 위에 가만히 내려앉을 때까지, 우리는 회전과 평행이동을 반복했다. 위 화면의 메쉬는 그 합의의 결과다.',
      '이렇게 만들어진 격자 한 칸은 0.1 mm. 사람의 머리카락 한 올보다 가는 단위로, 우리는 환자의 구강을 다시 짓는다.',
    ],
    pullquote: '치아 한 개를 1만 개의 점으로 다시 쓴다.',
    transition: '그러나 격자만으로는 아무것도 들리지 않는다. 우리는 먼저 조직을 구분해야 했다.',
  },
  {
    act_id: 'act-02-segment',
    kicker: 'ACT 02 · 분할',
    headline: '조직마다 소리의 속도가 다르다',
    hero_number: { value: '4', unit: 'class', caption: '치아 · 뼈 · 잇몸 · 공기' },
    body: [
      'DentalSegmentator가 격자 한 칸 한 칸에 이름을 붙였다. 법랑질, 상아질, 치은, 그리고 공기. 네 개의 라벨은 단순해 보이지만, 그 안에 음속이 숨어 있다.',
      '단단할수록 빠르다. 법랑질에서 탄성파는 거의 거침없이 미끄러지고, 잇몸에서는 절반의 속도로 끌린다. 위 단면도의 색은 사실 속도의 색이기도 하다.',
      '조직의 경계는 곧 속도의 절벽이다. 파동이 이 절벽을 만나면 일부는 통과하고 일부는 되돌아온다 — 우리가 듣게 될 메아리의 절반은 여기서 만들어진다.',
    ],
    pullquote: '분할은 해부가 아니라 음향이다.',
    transition: '건강한 잇몸의 소리를 알았다면, 이제 그것이 흐려질 때를 상상할 차례다.',
  },
  {
    act_id: 'act-03-lesion',
    kicker: 'ACT 03 · 가설',
    headline: '염증이 있다면, 어떤 소리가 날까',
    hero_number: { value: '50%', unit: '느림', caption: '염증 치은의 음속 감소' },
    body: [
      '정상 치은의 Vs는 약 0.05, 염증이 자리잡은 치은은 약 0.025. 절반의 속도. 숫자로는 작아 보이지만, 파동의 입장에서는 다른 세계다.',
      '우리는 가상의 병변을 한 voxel씩 심었다. 위치를 옮기고, 반지름을 키우고, 깊이를 바꿔본다. 위 모델 안의 붉은 점은 우리가 던진 질문이다 — "여기에 있다면?"',
      '이 질문은 진단이 아니다. 시뮬레이션이다. 우리는 아직 듣지 않았고, 다만 들을 준비를 하고 있다.',
    ],
    pullquote: '병변은 먼저 가설로 존재한다.',
    transition: '이제 진동자를 켤 시간이다.',
  },
  {
    act_id: 'act-04-wave',
    kicker: 'ACT 04 · 측정',
    headline: '75 마이크로초, 우리가 들은 시간',
    hero_number: { value: '75', unit: 'μs', caption: '100개의 수신기가 깨어 있던 찰나' },
    body: [
      '30 kHz의 탄성파가 치아 표면을 친다. 그 순간부터 75 마이크로초 동안, 100개의 수신기는 숨을 죽이고 표면의 떨림을 기록한다. 눈 한 번 깜빡일 시간의 약 4천분의 1.',
      '위 화면의 파면은 실시간이 아니다. 75,000개의 timestep을 우리가 영상으로 늘려놓은 것이다. 실제로는 빛처럼 지나간 일이다.',
      '그 짧은 시간 안에 파동은 법랑질을 통과하고, 상아질로 굴절하고, 잇몸의 가장자리에서 부서졌다. 그리고 가끔, 있어서는 안 될 자리에서 작게 진폭이 흔들렸다.',
    ],
    pullquote: '이 진폭이, 그 흔적이다.',
    transition: '한 번의 측정은 단서일 뿐이다. 우리는 모든 시각, 모든 자리에서 이 단서를 모아야 했다.',
  },
  {
    act_id: 'act-05-screening',
    kicker: 'ACT 05 · 후보',
    headline: '1000번의 메아리, 한 점의 의심',
    hero_number: { value: '1,000', unit: '회', caption: '우리가 다시 들어본 횟수' },
    body: [
      '한 점에서 들려온 진폭만으로는 부족하다. 우리는 75 마이크로초 전체의 에너지를 한 칸씩 누적했다. 시간 위의 모든 떨림이 공간 위의 한 색으로 응축되는 순간이다.',
      '위 히트맵의 밝은 부분은 의심이 모인 자리다. 어두운 곳은 파동이 무심히 지나간 곳이고, 환한 점은 무언가가 파동을 붙잡아 둔 곳이다.',
      '그러나 가장 밝은 점이 곧 답은 아니다. 표면 반사, 경계의 산란, 수신기의 편향 — 잡음은 빛처럼 모인다. 우리는 한 점을 골라야 했고, 그것은 셈의 문제가 아니라 추론의 문제였다.',
    ],
    pullquote: '가장 밝은 곳이 늘 답인 것은 아니다.',
    transition: '그래서 우리는 모든 가능성을 차례로 두드려보기로 했다.',
  },
  {
    act_id: 'act-06-inversion',
    kicker: 'ACT 06 · 결론',
    headline: '천 개의 가설, 하나의 결론',
    hero_number: { value: '0.2', unit: 'mm', caption: '추정 위치의 오차 — 약 2 voxel' },
    body: [
      '우리는 병변의 위치 (x, y, z, 반지름)를 천 번 다시 추측했다. 매번 조금씩 자리를 옮기고, 들려오는 소리가 더 그럴듯해지면 받아들이고, 아니면 버렸다. 받아들여진 비율은 약 40% — 너무 조심스럽지도, 너무 무모하지도 않은 보폭이었다.',
      '위 분포에서 보이듯, 천 개의 점은 한 자리로 수렴했다. 우리의 추정은 실제 병변과 약 0.2 mm — 격자로는 두 칸 — 떨어진 곳에 멈췄다.',
      '이 페이지가 진단을 대신하지는 않는다. 다만 우리는, 30 kHz의 떨림이 잇몸의 안쪽에서 무엇을 보고 왔는지를 옮겨 적었을 뿐이다.',
    ],
    pullquote: '0.2 mm. 우리가 들은 거리.',
    transition: '여기까지가 우리가 들은 이야기다.',
  },
]
