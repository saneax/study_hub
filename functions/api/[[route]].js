/**
 * Cloudflare Pages Function: /functions/api/[[route]].js
 * Handles D1 SQL persistence, R2 Object Storage for study diagrams/YAML artifacts,
 * and Cloudflare Workers AI pre-processing & post-processing pipelines.
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const method = request.method;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. HEALTH & BINDING STATUS
    if (path === "health" && method === "GET") {
      return new Response(JSON.stringify({
        ok: true,
        bindings: {
          d1: Boolean(env.DB),
          r2: Boolean(env.BUCKET),
          workersAi: Boolean(env.AI)
        },
        timestamp: new Date().toISOString()
      }), { headers: corsHeaders });
    }

    // 2. D1 COURSES & STUDY LOGS
    if (path === "courses" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM courses ORDER BY created_at ASC").all();
      return new Response(JSON.stringify({ courses: results }), { headers: corsHeaders });
    }

    if (path === "courses" && method === "POST") {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO courses (id, code, title, provider, color, target_date, target_hours, passing_score, status, domains_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      ).bind(b.id, b.code, b.title, b.provider, b.color, b.targetDate, b.targetHours, b.passingScore, b.status || "active", JSON.stringify(b.domains || [])).run();
      return new Response(JSON.stringify({ saved: true, id: b.id }), { headers: corsHeaders });
    }

    if (path === "logs" && method === "POST") {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO study_logs (id, course_id, domain_name, activity_type, hours, session_date, reflection, ai_takeaway)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(b.id, b.courseId, b.domain, b.activityType, b.hours, b.date, b.reflection || "", b.aiTakeaway || "").run();
      return new Response(JSON.stringify({ logged: true }), { headers: corsHeaders });
    }

    // 3. CLOUDFLARE R2 OBJECT STORAGE (Upload & Retrieve Architecture Diagrams, Kubeconfigs, YAML Labs)
    if (path.startsWith("r2/")) {
      const key = decodeURIComponent(path.slice(3));
      if (method === "PUT" || method === "POST") {
        const contentType = request.headers.get("Content-Type") || "application/octet-stream";
        const body = await request.arrayBuffer();
        await env.BUCKET.put(key, body, {
          httpMetadata: { contentType },
          customMetadata: { uploadedAt: new Date().toISOString() }
        });
        return new Response(JSON.stringify({ stored: true, key, size: body.byteLength }), { headers: corsHeaders });
      }
      if (method === "GET") {
        const obj = await env.BUCKET.get(key);
        if (!obj) return new Response(JSON.stringify({ error: "Asset not found in R2" }), { status: 404, headers: corsHeaders });
        const headers = new Headers(corsHeaders);
        obj.writeHttpMetadata(headers);
        headers.set("etag", obj.httpEtag);
        return new Response(obj.body, { headers });
      }
      if (method === "DELETE") {
        await env.BUCKET.delete(key);
        return new Response(JSON.stringify({ deleted: true, key }), { headers: corsHeaders });
      }
    }

    // 4. CLOUDFLARE WORKERS AI — PRE-PROCESSING: Raw Terminal / Scratchpad -> Structured Note + Tags + Embeddings
    if (path === "ai/preprocess-note" && method === "POST") {
      const { rawText, courseCode } = await request.json();
      const systemPrompt = `You are an expert Azure (AZ-104, AZ-305) and Kubernetes (CKA) technical editor.
Format the user's raw study notes or CLI output for ${courseCode} into clean Markdown with:
1. A concise 1-sentence Exam Anchor summary
2. Formatted CLI/YAML code blocks
3. Key Exam Gotchas & Pitfalls
Return JSON with keys: { "formattedMarkdown": string, "summary": string, "suggestedTags": string[] }.`;

      const aiResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText }
        ],
        response_format: { type: "json_object" }
      });

      // Also compute BGE vector embedding for semantic doc/note search
      const embedResp = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [rawText] });
      return new Response(JSON.stringify({
        ai: aiResp,
        embeddingVectorDim: embedResp?.data?.[0]?.length || 768
      }), { headers: corsHeaders });
    }

    // 5. CLOUDFLARE WORKERS AI — POST-PROCESSING: Generate Active-Recall Flashcards & 3-Node K8s / Azure Drill
    if (path === "ai/postprocess-note" && method === "POST") {
      const { noteTitle, noteContent, courseCode } = await request.json();
      const prompt = `Based on this ${courseCode} study note ("${noteTitle}"), generate 3 high-yield exam scenario flashcards and 1 hands-on verification command (for Azure CLI or a 3-node kubeadm Kubernetes cluster). Content:\n${noteContent}`;
      const aiResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: "Return concise JSON: { flashcards: [{q, a}], verificationCli: string, examTrap: string }" },
          { role: "user", content: prompt }
        ]
      });
      return new Response(JSON.stringify({ result: aiResp }), { headers: corsHeaders });
    }

    // 6. CLOUDFLARE WORKERS AI — POST-PROCESSING: Progress & Readiness Evaluation
    if (path === "ai/evaluate-progress" && method === "POST") {
      const payload = await request.json();
      const aiResp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "system",
            content: "You are a Cloud & Kubernetes Certification Coach evaluating a candidate tackling AZ-104 and AZ-305 this month (October) while practicing CKA on a 3-node cluster. Provide a candid readiness audit, identify the highest-risk exam domain, and prescribe 3 concrete hands-on tasks."
          },
          { role: "user", content: JSON.stringify(payload) }
        ]
      });
      return new Response(JSON.stringify({ evaluation: aiResp }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ status: "Cloudflare Pages API ready", route: path }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
