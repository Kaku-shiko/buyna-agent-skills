import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Msg = { role: "user" | "assistant"; content: string };

type Body = {
  session_id?: string;
  message?: string;
  history?: Msg[];
};

type SourceRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  category: string | null;
  price: number | null;
  currency: string | null;
  target_url: string | null;
  merchant_name: string | null;
  priority: number;
  tags: string[] | null;
};

type Recommendation = {
  id: string;
  title: string;
  reason: string;
  type: string;
  price: number | null;
  currency: string | null;
  target_url: string | null;
  merchant_name: string | null;
};

export const Route = createFileRoute("/api/ai-shopping-guide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const message = (body.message ?? "").trim();
        const sessionId = (body.session_id ?? "").trim() || crypto.randomUUID();
        const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

        if (!message) {
          return Response.json({ error: "message is required" }, { status: 400 });
        }
        if (message.length > 2000) {
          return Response.json({ error: "message too long" }, { status: 400 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!lovableKey && !openaiKey) {
          return Response.json({
            configured: false,
            answer:
              "AI 购物导购暂未配置。管理员配置 LOVABLE_API_KEY 或 OPENAI_API_KEY 后即可开启此功能。",
            recommendations: [],
            session_id: sessionId,
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

        let rows: SourceRow[] = [];
        if (supabaseUrl && publishable) {
          const supabase = createClient(supabaseUrl, publishable, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: sources, error: srcErr } = await supabase
            .from("ai_guide_sources")
            .select(
              "id, type, title, description, category, price, currency, target_url, merchant_name, priority, tags",
            )
            .eq("is_active", true)
            .order("priority", { ascending: false })
            .limit(50);

          if (srcErr) {
            console.error("ai_guide_sources load error", srcErr);
          }
          rows = (sources ?? []) as SourceRow[];
        } else {
          console.warn("AI guide source lookup skipped: missing Supabase env");
        }

        const catalog = rows.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          category: r.category,
          price: r.price,
          currency: r.currency,
          target_url: r.target_url,
          merchant_name: r.merchant_name,
          tags: r.tags,
        }));

        const systemPrompt = `你是 Buyna.ai 面向消费者和商家的 AI 购物与服务导购助手。
目标：帮助用户找到想买的商品、想预约的服务，或适合自己生意的 Buyna.ai 官网/收款套餐。

回答规则：
- 使用用户的语言自然回答，支持中文、日本語和 English。
- 优先推荐下方 CATALOG 里的 Buyna.ai 生态商品、服务、商家官网或套餐。
- 不要编造 CATALOG 之外的价格、库存、商家或链接。
- 如果 CATALOG 里没有匹配项，可以给出通用购买/服务建议，并说明 Buyna.ai 目前暂未收录相关商家；此时 recommendations 返回空数组。
- 意图不明确时，先用一句话反问澄清，例如预算、日期、地点或风格，不要一次问太多。
- 语气友好、简洁，不要重复推荐卡片里已经展示的字段。

输出必须是严格 JSON：{ "answer": string, "recommendations": Array<{ "id": string, "reason": string }> }
- recommendations 最多 3 条，每条 id 必须来自 CATALOG，可以为空数组。

CATALOG (JSON):
${JSON.stringify(catalog)}`;

        const messages = [
          { role: "system", content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: String(m.content ?? "") })),
          { role: "user", content: message },
        ];

        // Prefer Lovable AI Gateway (Gemini); fall back to OpenAI if needed.
        const useLovable = Boolean(lovableKey);
        const endpoint = useLovable
          ? "https://ai.gateway.lovable.dev/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
        const model = useLovable ? "google/gemini-3-flash-preview" : "gpt-4o-mini";
        const authHeaders: Record<string, string> = useLovable
          ? { "Lovable-API-Key": lovableKey as string }
          : { authorization: `Bearer ${openaiKey}` };

        let answer = "";
        let recIds: { id: string; reason: string }[] = [];

        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify({
              model,
              messages,
              response_format: { type: "json_object" },
              temperature: 0.4,
            }),
          });

          if (!resp.ok) {
            const txt = await resp.text();
            console.error("AI gateway error", resp.status, txt);
            const friendly =
              resp.status === 429
                ? "当前访问量较大，请稍等片刻再试。"
                : resp.status === 402
                  ? "AI 导购额度已用完，请联系管理员。"
                  : "AI 导购暂时不可用，请稍后再试。";
            return Response.json(
              { answer: friendly, recommendations: [], session_id: sessionId },
              { status: 200 },
            );
          }

          const json = (await resp.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const content = json.choices?.[0]?.message?.content ?? "{}";
          // Some models wrap JSON in ```json ... ``` fences; strip defensively.
          const cleaned = content
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```$/i, "")
            .trim();

          let parsed: {
            answer?: string;
            recommendations?: { id?: string; reason?: string }[];
          } = {};
          try {
            parsed = JSON.parse(cleaned);
          } catch {
            parsed = { answer: cleaned };
          }

          answer = (parsed.answer ?? "").toString();
          recIds = (parsed.recommendations ?? [])
            .filter((r) => r && typeof r.id === "string")
            .slice(0, 3)
            .map((r) => ({ id: String(r.id), reason: String(r.reason ?? "") }));
        } catch (err) {
          console.error("ai-shopping-guide error", err);
          return Response.json(
            {
              answer: "AI 导购暂时不可用，请稍后再试。",
              recommendations: [],
              session_id: sessionId,
            },
            { status: 200 },
          );
        }

        const byId = new Map(rows.map((r) => [r.id, r]));
        const recommendations: Recommendation[] = recIds
          .map(({ id, reason }) => {
            const s = byId.get(id);
            if (!s) return null;
            return {
              id: s.id,
              title: s.title,
              reason: reason || s.description || "",
              type: s.type,
              price: s.price,
              currency: s.currency,
              target_url: s.target_url,
              merchant_name: s.merchant_name,
            } satisfies Recommendation;
          })
          .filter((v): v is Recommendation => v !== null);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("ai_guide_conversations").insert({
            session_id: sessionId,
            user_message: message,
            ai_answer: answer,
            recommended_source_ids: recommendations.map((r) => r.id),
          });
        } catch (err) {
          console.error("ai_guide_conversations log failed", err);
        }

        return Response.json({
          configured: true,
          answer,
          recommendations,
          session_id: sessionId,
        });
      },
    },
  },
});
