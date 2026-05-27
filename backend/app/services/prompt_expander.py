import re
from dataclasses import dataclass


@dataclass
class ExpandOptions:
    style: str = "realistic"
    aspect: str = "default"


INDUSTRIAL_KEYWORDS = [
    "污水厂",
    "自来水厂",
    "发电厂",
    "垃圾焚烧",
    "工厂",
    "园区",
    "高铁站",
    "机场",
    "港口",
]
PEOPLE_KEYWORDS = ["男人", "女人", "小孩", "小女孩", "小男孩", "老人", "学生", "老师", "工人", "医生", "护士", "司机", "游客"]
NATURE_KEYWORDS = ["山", "水", "森林", "湖泊", "海边", "草地", "天空", "日出", "日落"]
CITY_KEYWORDS = ["城市", "街道", "商场", "办公楼", "住宅区", "小区", "广场", "学校", "医院", "新城", "科技城", "科技新城"]
PRODUCT_KEYWORDS = ["西瓜", "冰棍", "手机", "电脑", "汽车", "饮料", "家具", "衣服", "鞋子"]


def clean_prompt(prompt: str) -> str:
    """清理用户输入中的换行和多余空格，保留原始主体语义。"""

    text = re.sub(r"[\r\n\t]+", " ", prompt or "")
    text = re.sub(r"\s+", "", text)
    return text.strip("，。,. ")


def detect_category(prompt: str) -> str:
    """用简单关键词判断主体类别，命中越具体的类别越优先。"""

    if any(keyword in prompt for keyword in INDUSTRIAL_KEYWORDS):
        return "industrial"
    if any(keyword in prompt for keyword in PEOPLE_KEYWORDS):
        return "people"
    if any(keyword in prompt for keyword in PRODUCT_KEYWORDS):
        return "product"
    if any(keyword in prompt for keyword in CITY_KEYWORDS):
        return "city"
    if any(keyword in prompt for keyword in NATURE_KEYWORDS):
        return "nature"
    return "default"


def industrial_subject(prompt: str) -> str:
    """对常见工业主体做更自然的中文称谓补全。"""

    mapping = {
        "污水厂": "现代化污水处理厂",
        "自来水厂": "现代化自来水厂",
        "垃圾焚烧": "现代化垃圾焚烧发电厂",
        "科技新城": "现代化科技新城",
        "科技城": "现代化科技城",
    }
    for key, value in mapping.items():
        if key in prompt:
            return prompt.replace(key, value)
    return f"现代化的{prompt}"


def build_parts(prompt: str, category: str) -> list[str]:
    """按类别拼接短语模板，保持 80-160 中文字符左右，避免生成长段落。"""

    if category == "industrial":
        subject = industrial_subject(prompt)
        parts = [
            f"一座{subject}",
            "大型设备和建筑结构清晰可见",
            "场景布局整齐",
            "具有真实工业环境氛围",
            "广角构图",
            "白天自然光",
            "真实摄影风格",
            "高细节",
            "高清画质",
        ]
        if "污水" in prompt:
            parts.insert(1, "巨大的处理池排列整齐")
        if "自来水" in prompt:
            parts.insert(1, "储水塔和厂区设施清晰可见")
        if "科技" in prompt:
            parts.insert(1, "高楼建筑和科技感园区规划清晰")
        return parts
    if category == "people":
        parts = [
            prompt,
            "人物表情自然",
            "动作真实",
            "背景环境贴近日常生活",
            "柔和光线",
            "中景构图",
            "真实摄影风格",
            "画面干净",
            "高细节",
            "高清画质",
        ]
        if "电视" in prompt:
            parts.insert(1, "温馨客厅或室内环境")
        return parts
    if category == "nature":
        return [
            prompt,
            "自然环境开阔",
            "层次丰富",
            "光影柔和",
            "画面具有空间感",
            "真实摄影风格",
            "广角构图",
            "高细节",
            "高清画质",
        ]
    if category == "city":
        parts = [
            prompt,
            "现代城市环境",
            "建筑结构清晰",
            "街道和空间布局自然",
            "真实摄影风格",
            "广角构图",
            "白天自然光",
            "高细节",
            "高清画质",
        ]
        if "科技" in prompt:
            parts.insert(2, "高楼建筑和科技感空间明显")
        return parts
    if category == "product":
        return [
            prompt,
            "主体清晰突出",
            "背景简洁干净",
            "柔和自然光",
            "产品摄影风格",
            "近景构图",
            "细节丰富",
            "高清画质",
        ]
    return [
        prompt,
        "画面主体明确",
        "场景细节丰富",
        "构图自然",
        "光线柔和",
        "真实摄影风格",
        "高细节",
        "高清画质",
    ]


def dedupe_parts(parts: list[str], original_prompt: str) -> list[str]:
    """如果原始描述已经包含某些画面词，就跳过相同语义短语，避免重复堆词。"""

    seen = set()
    result = []
    duplicate_hints = {
        "高清画质": ["高清", "高画质"],
        "真实摄影风格": ["真实摄影", "摄影风格"],
        "白天自然光": ["自然光", "白天"],
        "柔和自然光": ["自然光", "柔和光"],
        "广角构图": ["广角"],
        "近景构图": ["近景"],
        "中景构图": ["中景"],
        "高细节": ["高细节", "细节丰富"],
    }
    for part in parts:
        key = part.strip()
        if not key or key in seen:
            continue
        hints = duplicate_hints.get(key, [])
        if any(hint in original_prompt for hint in hints):
            continue
        seen.add(key)
        result.append(key)
    return result


def trim_expanded_prompt(parts: list[str], min_chars: int = 80, max_chars: int = 160) -> str:
    """控制扩写长度，不够时保留核心画质短语，过长时从末尾裁掉非主体补充。"""

    selected = parts[:]
    while len("，".join(selected)) > max_chars and len(selected) > 5:
        selected.pop(-2 if selected[-1] == "高清画质" else -1)
    text = "，".join(selected)
    if len(text) < min_chars and "高清画质" not in selected:
        text = f"{text}，高清画质"
    return text


def expand_prompt(original_prompt: str, options: ExpandOptions | None = None) -> str:
    """本地规则版扩写入口：清理主体 -> 分类 -> 套模板 -> 去重 -> 控长。"""

    prompt = clean_prompt(original_prompt)
    if not prompt:
        return ""
    category = detect_category(prompt)
    parts = build_parts(prompt, category)
    return trim_expanded_prompt(dedupe_parts(parts, prompt))
