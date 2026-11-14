// \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
// server.js
var server_exports = /* @__PURE__ */ __exportAll({ default: () => server_default });
function getApiKey() {
	const key = typeof process !== "undefined" && process.env && process.env.QWEN_API_KEY || "";
	if (!key) throw new Error("未配置 QWEN_API_KEY 环境变量（参考 .env.example）");
	return key;
}
function errDetail(e) {
	const cause = e?.cause;
	const causeMsg = cause?.message || cause?.code || (cause ? String(cause) : "");
	return causeMsg ? `${e?.message || e} (cause: ${causeMsg})` : String(e?.message || e);
}
async function healthCheck() {
	let apiKey;
	try {
		apiKey = getApiKey();
	} catch (e) {
		return {
			dashscope: false,
			reason: e.message
		};
	}
	const credRes = await fetch(`${QWEN.uploadUrl}?action=getPolicy&model=${QWEN.model}`, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!credRes.ok) return {
		dashscope: false,
		status: credRes.status
	};
	const cred = await credRes.json();
	return {
		dashscope: true,
		status: credRes.status,
		uploadHost: cred?.data?.upload_host
	};
}
async function uploadToDashScope(videoBytes, videoName, mimeType) {
	const apiKey = getApiKey();
	const credRes = await fetch(`${QWEN.uploadUrl}?action=getPolicy&model=${QWEN.model}`, { headers: { Authorization: `Bearer ${apiKey}` } });
	if (!credRes.ok) throw new Error(`获取上传凭证失败 ${credRes.status}: ${await credRes.text()}`);
	const d = (await credRes.json()).data;
	const ext = (videoName.match(/\.(\w+)$/) || [null, "mp4"])[1];
	const key = `${d.upload_dir}/${Date.now()}.${ext}`;
	const form = new FormData();
	form.append("OSSAccessKeyId", d.oss_access_key_id);
	form.append("Signature", d.signature);
	form.append("policy", d.policy);
	form.append("x-oss-object-acl", d.x_oss_object_acl || "private");
	form.append("x-oss-forbid-overwrite", d.x_oss_forbid_overwrite || "true");
	form.append("key", key);
	form.append("success_action_status", "200");
	form.append("file", new Blob([videoBytes], { type: mimeType }), `video.${ext}`);
	const upRes = await fetch(d.upload_host, {
		method: "POST",
		body: form
	});
	if (upRes.status !== 200) throw new Error(`上传视频到 DashScope 失败 ${upRes.status}: ${await upRes.text()}`);
	return `oss://${key}`;
}
async function analyzeVideo(videoBytes, videoName, mimeType, rank = "") {
	const ossUrl = await uploadToDashScope(videoBytes, videoName, mimeType);
	const prompt = `你是无畏契约（VALORANT）复盘教练。这是玩家上传的一段 POV 对局视频（文件名：${videoName}）。${rank ? `该玩家当前段位是「${rank}」，评估能力时请以这个段位的平均水平作为基准。` : ""}
请仔细观看视频，返回一个 JSON 对象（不要多余文字），包含两个字段：

1. nodes：3-5 个关键决策节点数组，每项：
- time：时间点（mm:ss）
- title：场景标题
- advice：更好的打法建议
- agents：该时刻场上特工数组，每项 {name(中文特工名), team("ally"或"enemy"), pos(报点), skill(技能名，没有则省略)}
- smokes：烟雾数组，每项 {pos(报点)}
- utilities：哨位道具数组，每项 {type("camera"/"turret"/"wire"/"dart"), team, pos(报点)}

2. profile：针对视频里「这位玩家」的表现评估（不是通用建议，是基于该玩家的实际发挥）：
- abilities：能力评分对象，每项 1-5 分（0.5 粒度），以「同段位平均水平」为 3 分基准（3=该段位平均，4=中上，2=中下）：枪法、反应、道具使用、残局处理、经济管理、地图理解
- habits：本局观察到的行为习惯，简短中文标签数组（如"不爱搜点"、"残局偏紧张"、"喜欢激进"），只列确凿的

示例：
{"nodes":[{"time":"00:32","title":"残局 1v2 守 B 点","advice":"...","agents":[{"name":"捷风","team":"ally","pos":"B点","skill":"冲刺"}],"smokes":[{"pos":"B大"}],"utilities":[{"type":"camera","team":"enemy","pos":"B窗"}]}],"profile":{"abilities":{"枪法":4,"反应":3.5,"道具使用":3,"残局处理":3.5,"经济管理":3,"地图理解":3.5},"habits":["不爱搜点"]}}`;
	const messages = [{
		role: "user",
		content: [{
			type: "video_url",
			video_url: { url: ossUrl }
		}, {
			type: "text",
			text: prompt
		}]
	}];
	const res = await fetch(`${QWEN.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${getApiKey()}`,
			"X-DashScope-OssResourceResolve": "enable"
		},
		body: JSON.stringify({
			model: QWEN.model,
			messages,
			max_tokens: 4e3
		})
	});
	if (!res.ok) throw new Error(`Qwen API ${res.status}: ${await res.text()}`);
	const data = await res.json();
	return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || null;
}
var QWEN, server_default;
var init_server = __esmMin((() => {
	QWEN = {
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		uploadUrl: "https://dashscope.aliyuncs.com/api/v1/uploads",
		model: "qwen3.8-flash"
	};
	server_default = { async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api/health" && request.method === "GET") try {
			const diag = await healthCheck();
			return Response.json({
				ok: true,
				runtime: process.version,
				platform: process.platform,
				...diag
			});
		} catch (e) {
			return Response.json({
				ok: false,
				runtime: process.version,
				platform: process.platform,
				error: errDetail(e)
			}, { status: 500 });
		}
		if (url.pathname === "/api/analyze" && request.method === "POST") try {
			const reply = await analyzeVideo(await request.arrayBuffer(), decodeURIComponent(request.headers.get("X-Video-Name") || "video.mp4"), request.headers.get("X-Video-Type") || "video/mp4", decodeURIComponent(request.headers.get("X-Rank") || ""));
			return Response.json({ reply });
		} catch (e) {
			return Response.json({ error: errDetail(e) }, { status: 500 });
		}
		return new Response("not found", { status: 404 });
	} };
}));
// C:/Users/24996/AppData/Local/Temp/acde-backend-QUf0j4/acde-server.mjs
var main = (await Promise.resolve().then(() => (init_server(), server_exports))).default;
var serve = globalThis[Symbol.for("acde.serve")];
if (typeof serve === "function" && main && typeof main.fetch === "function") serve(main);
export { main as default };

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci5qcyIsIkM6L1VzZXJzLzI0OTk2L0FwcERhdGEvTG9jYWwvVGVtcC9hY2RlLWJhY2tlbmQtUVVmMGo0L2FjZGUtc2VydmVyLm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzZXJ2ZXIuanMg4oCU4oCUIOWQjuerryBBSSDku6PnkIbvvIhhY2RlIGJhY2tlbmTvvIxDbG91ZGZsYXJlIFdvcmtlcnMg6aOO5qC877yJXG4vLyDop4bpopHotbAgRGFzaFNjb3BlIOWGhee9ruaWh+S7tuS4iuS8oO+8iOaXoOmcgOiHquW7uiBPU1PvvInmi78gb3NzOi8vIFVSTO+8jOWGjeiwgyBRd2VuIOinhumikeWIhuaekFxuXG5jb25zdCBRV0VOID0ge1xuICBiYXNlVXJsOiAnaHR0cHM6Ly9kYXNoc2NvcGUuYWxpeXVuY3MuY29tL2NvbXBhdGlibGUtbW9kZS92MScsXG4gIHVwbG9hZFVybDogJ2h0dHBzOi8vZGFzaHNjb3BlLmFsaXl1bmNzLmNvbS9hcGkvdjEvdXBsb2FkcycsXG4gIG1vZGVsOiAncXdlbjMuOC1mbGFzaCcsXG59XG5cbi8vIEFQSSBLZXkg5Y+q5LuO546v5aKD5Y+Y6YeP6K+75Y+W77yM5LiN5YaZ6L+b5rqQ56CBIC8g5LuT5bqT44CCXG4vLyDmnKzlnLDlvIDlj5HvvJouZW52IOmHjOeahCBRV0VOX0FQSV9LRVnvvIhkZXYtYmFja2VuZC5tanMg5Lya5Yqg6L2977yJXG4vLyBhY2RlcnQg55yf5py677ya5ZCv5Yqo5YmN5oqKIFFXRU5fQVBJX0tFWSDorr7nva7liLDlrr/kuLvnjq/looNcbmZ1bmN0aW9uIGdldEFwaUtleSgpIHtcbiAgY29uc3Qga2V5ID1cbiAgICAodHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmIHByb2Nlc3MuZW52ICYmIHByb2Nlc3MuZW52LlFXRU5fQVBJX0tFWSkgfHwgJydcbiAgaWYgKCFrZXkpIHRocm93IG5ldyBFcnJvcign5pyq6YWN572uIFFXRU5fQVBJX0tFWSDnjq/looPlj5jph4/vvIjlj4LogIMgLmVudi5leGFtcGxl77yJJylcbiAgcmV0dXJuIGtleVxufVxuXG4vLyDmioogdW5kaWNpIOeahCBcImZldGNoIGZhaWxlZFwiIOS5i+exu+eahOmUmeivr+WxleW8gOWHuiBjYXVzZe+8jOaWueS+v+WumuS9je+8iFRMUyAvIEROUyAvIOe9kee7nO+8iVxuZnVuY3Rpb24gZXJyRGV0YWlsKGUpIHtcbiAgY29uc3QgY2F1c2UgPSBlPy5jYXVzZVxuICBjb25zdCBjYXVzZU1zZyA9IGNhdXNlPy5tZXNzYWdlIHx8IGNhdXNlPy5jb2RlIHx8IChjYXVzZSA/IFN0cmluZyhjYXVzZSkgOiAnJylcbiAgcmV0dXJuIGNhdXNlTXNnID8gYCR7ZT8ubWVzc2FnZSB8fCBlfSAoY2F1c2U6ICR7Y2F1c2VNc2d9KWAgOiBTdHJpbmcoZT8ubWVzc2FnZSB8fCBlKVxufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGFzeW5jIGZldGNoKHJlcXVlc3QpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHJlcXVlc3QudXJsKVxuXG4gICAgaWYgKHVybC5wYXRobmFtZSA9PT0gJy9hcGkvaGVhbHRoJyAmJiByZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRpYWcgPSBhd2FpdCBoZWFsdGhDaGVjaygpXG4gICAgICAgIHJldHVybiBSZXNwb25zZS5qc29uKHsgb2s6IHRydWUsIHJ1bnRpbWU6IHByb2Nlc3MudmVyc2lvbiwgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sIC4uLmRpYWcgfSlcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIFJlc3BvbnNlLmpzb24oeyBvazogZmFsc2UsIHJ1bnRpbWU6IHByb2Nlc3MudmVyc2lvbiwgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0sIGVycm9yOiBlcnJEZXRhaWwoZSkgfSwgeyBzdGF0dXM6IDUwMCB9KVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh1cmwucGF0aG5hbWUgPT09ICcvYXBpL2FuYWx5emUnICYmIHJlcXVlc3QubWV0aG9kID09PSAnUE9TVCcpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHZpZGVvQnl0ZXMgPSBhd2FpdCByZXF1ZXN0LmFycmF5QnVmZmVyKClcbiAgICAgICAgY29uc3QgdmlkZW9OYW1lID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlcXVlc3QuaGVhZGVycy5nZXQoJ1gtVmlkZW8tTmFtZScpIHx8ICd2aWRlby5tcDQnKVxuICAgICAgICBjb25zdCBtaW1lVHlwZSA9IHJlcXVlc3QuaGVhZGVycy5nZXQoJ1gtVmlkZW8tVHlwZScpIHx8ICd2aWRlby9tcDQnXG4gICAgICAgIGNvbnN0IHJhbmsgPSBkZWNvZGVVUklDb21wb25lbnQocmVxdWVzdC5oZWFkZXJzLmdldCgnWC1SYW5rJykgfHwgJycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYXdhaXQgYW5hbHl6ZVZpZGVvKHZpZGVvQnl0ZXMsIHZpZGVvTmFtZSwgbWltZVR5cGUsIHJhbmspXG4gICAgICAgIHJldHVybiBSZXNwb25zZS5qc29uKHsgcmVwbHkgfSlcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuIFJlc3BvbnNlLmpzb24oeyBlcnJvcjogZXJyRGV0YWlsKGUpIH0sIHsgc3RhdHVzOiA1MDAgfSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKCdub3QgZm91bmQnLCB7IHN0YXR1czogNDA0IH0pXG4gIH0sXG59XG5cbi8vIOi9u+mHj+i/numAmuaAp+iHquajgO+8muWPquiwgyBnZXRQb2xpY3nvvIjml6Dlia/kvZznlKjvvInvvIzov5Tlm57plJnor6/or6bmg4VcbmFzeW5jIGZ1bmN0aW9uIGhlYWx0aENoZWNrKCkge1xuICBsZXQgYXBpS2V5XG4gIHRyeSB7XG4gICAgYXBpS2V5ID0gZ2V0QXBpS2V5KClcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB7IGRhc2hzY29wZTogZmFsc2UsIHJlYXNvbjogZS5tZXNzYWdlIH1cbiAgfVxuICBjb25zdCBjcmVkUmVzID0gYXdhaXQgZmV0Y2goYCR7UVdFTi51cGxvYWRVcmx9P2FjdGlvbj1nZXRQb2xpY3kmbW9kZWw9JHtRV0VOLm1vZGVsfWAsIHtcbiAgICBoZWFkZXJzOiB7IEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHthcGlLZXl9YCB9LFxuICB9KVxuICBpZiAoIWNyZWRSZXMub2spIHJldHVybiB7IGRhc2hzY29wZTogZmFsc2UsIHN0YXR1czogY3JlZFJlcy5zdGF0dXMgfVxuICBjb25zdCBjcmVkID0gYXdhaXQgY3JlZFJlcy5qc29uKClcbiAgcmV0dXJuIHsgZGFzaHNjb3BlOiB0cnVlLCBzdGF0dXM6IGNyZWRSZXMuc3RhdHVzLCB1cGxvYWRIb3N0OiBjcmVkPy5kYXRhPy51cGxvYWRfaG9zdCB9XG59XG5cbi8vIDEpIOS4iuS8oOinhumikeWIsCBEYXNoU2NvcGUg5YaF572u5a2Y5YKo77yM5ou/IG9zczovLyBVUkxcbmFzeW5jIGZ1bmN0aW9uIHVwbG9hZFRvRGFzaFNjb3BlKHZpZGVvQnl0ZXMsIHZpZGVvTmFtZSwgbWltZVR5cGUpIHtcbiAgY29uc3QgYXBpS2V5ID0gZ2V0QXBpS2V5KClcbiAgY29uc3QgY3JlZFJlcyA9IGF3YWl0IGZldGNoKGAke1FXRU4udXBsb2FkVXJsfT9hY3Rpb249Z2V0UG9saWN5Jm1vZGVsPSR7UVdFTi5tb2RlbH1gLCB7XG4gICAgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7YXBpS2V5fWAgfSxcbiAgfSlcbiAgaWYgKCFjcmVkUmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYOiOt+WPluS4iuS8oOWHreivgeWksei0pSAke2NyZWRSZXMuc3RhdHVzfTogJHthd2FpdCBjcmVkUmVzLnRleHQoKX1gKVxuICBjb25zdCBjcmVkID0gYXdhaXQgY3JlZFJlcy5qc29uKClcbiAgY29uc3QgZCA9IGNyZWQuZGF0YVxuXG4gIC8vIOeUqOaXtumXtOaIs+WBmuaWh+S7tuWQje+8jOmBv+WFjeS4reaWhy/nibnmrorlrZfnrKbpl67popjjgIJcbiAgLy8g5rOo5oSP77yadXBsb2FkX2RpciDmmK/jgIznm67lvZXliY3nvIDjgI3vvIzlkI7pnaLlv4XpobvliqAgXCIvXCIg5YaN5o6l5paH5Lu25ZCN77yMXG4gIC8vIOWQpuWImSBPU1Mg5a+56LGh5Lya57KY5ZyoIHV1aWQg5LiK77yMUXdlbiDop6PmnpDml7Ygb3duZXJzaGlwIGNoZWNrIOWksei0pe+8iGFjY2Vzc19kZW5pZWTvvInjgIJcbiAgY29uc3QgZXh0ID0gKHZpZGVvTmFtZS5tYXRjaCgvXFwuKFxcdyspJC8pIHx8IFtudWxsLCAnbXA0J10pWzFdXG4gIGNvbnN0IGtleSA9IGAke2QudXBsb2FkX2Rpcn0vJHtEYXRlLm5vdygpfS4ke2V4dH1gXG5cbiAgY29uc3QgZm9ybSA9IG5ldyBGb3JtRGF0YSgpXG4gIGZvcm0uYXBwZW5kKCdPU1NBY2Nlc3NLZXlJZCcsIGQub3NzX2FjY2Vzc19rZXlfaWQpXG4gIGZvcm0uYXBwZW5kKCdTaWduYXR1cmUnLCBkLnNpZ25hdHVyZSlcbiAgZm9ybS5hcHBlbmQoJ3BvbGljeScsIGQucG9saWN5KVxuICBmb3JtLmFwcGVuZCgneC1vc3Mtb2JqZWN0LWFjbCcsIGQueF9vc3Nfb2JqZWN0X2FjbCB8fCAncHJpdmF0ZScpXG4gIGZvcm0uYXBwZW5kKCd4LW9zcy1mb3JiaWQtb3ZlcndyaXRlJywgZC54X29zc19mb3JiaWRfb3ZlcndyaXRlIHx8ICd0cnVlJylcbiAgZm9ybS5hcHBlbmQoJ2tleScsIGtleSlcbiAgZm9ybS5hcHBlbmQoJ3N1Y2Nlc3NfYWN0aW9uX3N0YXR1cycsICcyMDAnKVxuICBmb3JtLmFwcGVuZCgnZmlsZScsIG5ldyBCbG9iKFt2aWRlb0J5dGVzXSwgeyB0eXBlOiBtaW1lVHlwZSB9KSwgYHZpZGVvLiR7ZXh0fWApXG5cbiAgY29uc3QgdXBSZXMgPSBhd2FpdCBmZXRjaChkLnVwbG9hZF9ob3N0LCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiBmb3JtIH0pXG4gIGlmICh1cFJlcy5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKGDkuIrkvKDop4bpopHliLAgRGFzaFNjb3BlIOWksei0pSAke3VwUmVzLnN0YXR1c306ICR7YXdhaXQgdXBSZXMudGV4dCgpfWApXG5cbiAgcmV0dXJuIGBvc3M6Ly8ke2tleX1gXG59XG5cbi8vIDIpIOeUqCBvc3M6Ly8gVVJMIOiwgyBRd2VuIOinhumikeWIhuaekFxuYXN5bmMgZnVuY3Rpb24gYW5hbHl6ZVZpZGVvKHZpZGVvQnl0ZXMsIHZpZGVvTmFtZSwgbWltZVR5cGUsIHJhbmsgPSAnJykge1xuICBjb25zdCBvc3NVcmwgPSBhd2FpdCB1cGxvYWRUb0Rhc2hTY29wZSh2aWRlb0J5dGVzLCB2aWRlb05hbWUsIG1pbWVUeXBlKVxuXG4gIGNvbnN0IHByb21wdCA9IGDkvaDmmK/ml6DnlY/lpZHnuqbvvIhWQUxPUkFOVO+8ieWkjeebmOaVmee7g+OAgui/meaYr+eOqeWutuS4iuS8oOeahOS4gOautSBQT1Yg5a+55bGA6KeG6aKR77yI5paH5Lu25ZCN77yaJHt2aWRlb05hbWV977yJ44CCJHtyYW5rID8gYOivpeeOqeWutuW9k+WJjeauteS9jeaYr+OAjCR7cmFua33jgI3vvIzor4TkvLDog73lipvml7bor7fku6Xov5nkuKrmrrXkvY3nmoTlubPlnYfmsLTlubPkvZzkuLrln7rlh4bjgIJgIDogJyd9XG7or7fku5Tnu4bop4LnnIvop4bpopHvvIzov5Tlm57kuIDkuKogSlNPTiDlr7nosaHvvIjkuI3opoHlpJrkvZnmloflrZfvvInvvIzljIXlkKvkuKTkuKrlrZfmrrXvvJpcblxuMS4gbm9kZXPvvJozLTUg5Liq5YWz6ZSu5Yaz562W6IqC54K55pWw57uE77yM5q+P6aG577yaXG4tIHRpbWXvvJrml7bpl7TngrnvvIhtbTpzc++8iVxuLSB0aXRsZe+8muWcuuaZr+agh+mimFxuLSBhZHZpY2XvvJrmm7Tlpb3nmoTmiZPms5Xlu7rorq5cbi0gYWdlbnRz77ya6K+l5pe25Yi75Zy65LiK54m55bel5pWw57uE77yM5q+P6aG5IHtuYW1lKOS4reaWh+eJueW3peWQjSksIHRlYW0oXCJhbGx5XCLmiJZcImVuZW15XCIpLCBwb3Mo5oql54K5KSwgc2tpbGwo5oqA6IO95ZCN77yM5rKh5pyJ5YiZ55yB55WlKX1cbi0gc21va2Vz77ya54Of6Zu+5pWw57uE77yM5q+P6aG5IHtwb3Mo5oql54K5KX1cbi0gdXRpbGl0aWVz77ya5ZOo5L2N6YGT5YW35pWw57uE77yM5q+P6aG5IHt0eXBlKFwiY2FtZXJhXCIvXCJ0dXJyZXRcIi9cIndpcmVcIi9cImRhcnRcIiksIHRlYW0sIHBvcyjmiqXngrkpfVxuXG4yLiBwcm9maWxl77ya6ZKI5a+56KeG6aKR6YeM44CM6L+Z5L2N546p5a6244CN55qE6KGo546w6K+E5Lyw77yI5LiN5piv6YCa55So5bu66K6u77yM5piv5Z+65LqO6K+l546p5a6255qE5a6e6ZmF5Y+R5oyl77yJ77yaXG4tIGFiaWxpdGllc++8muiDveWKm+ivhOWIhuWvueixoe+8jOavj+mhuSAxLTUg5YiG77yIMC41IOeykuW6pu+8ie+8jOS7peOAjOWQjOauteS9jeW5s+Wdh+awtOW5s+OAjeS4uiAzIOWIhuWfuuWHhu+8iDM96K+l5q615L2N5bmz5Z2H77yMND3kuK3kuIrvvIwyPeS4reS4i++8ie+8muaequazleOAgeWPjeW6lOOAgemBk+WFt+S9v+eUqOOAgeaui+WxgOWkhOeQhuOAgee7j+a1jueuoeeQhuOAgeWcsOWbvueQhuino1xuLSBoYWJpdHPvvJrmnKzlsYDop4Llr5/liLDnmoTooYzkuLrkuaDmg6/vvIznroDnn63kuK3mlofmoIfnrb7mlbDnu4TvvIjlpoJcIuS4jeeIseaQnOeCuVwi44CBXCLmrovlsYDlgY/ntKflvKBcIuOAgVwi5Zac5qyi5r+A6L+bXCLvvInvvIzlj6rliJfnoa7lh7/nmoRcblxu56S65L6L77yaXG57XCJub2Rlc1wiOlt7XCJ0aW1lXCI6XCIwMDozMlwiLFwidGl0bGVcIjpcIuaui+WxgCAxdjIg5a6IIEIg54K5XCIsXCJhZHZpY2VcIjpcIi4uLlwiLFwiYWdlbnRzXCI6W3tcIm5hbWVcIjpcIuaNt+mjjlwiLFwidGVhbVwiOlwiYWxseVwiLFwicG9zXCI6XCJC54K5XCIsXCJza2lsbFwiOlwi5Yay5Yi6XCJ9XSxcInNtb2tlc1wiOlt7XCJwb3NcIjpcIkLlpKdcIn1dLFwidXRpbGl0aWVzXCI6W3tcInR5cGVcIjpcImNhbWVyYVwiLFwidGVhbVwiOlwiZW5lbXlcIixcInBvc1wiOlwiQueql1wifV19XSxcInByb2ZpbGVcIjp7XCJhYmlsaXRpZXNcIjp7XCLmnqrms5VcIjo0LFwi5Y+N5bqUXCI6My41LFwi6YGT5YW35L2/55SoXCI6MyxcIuaui+WxgOWkhOeQhlwiOjMuNSxcIue7j+a1jueuoeeQhlwiOjMsXCLlnLDlm77nkIbop6NcIjozLjV9LFwiaGFiaXRzXCI6W1wi5LiN54ix5pCc54K5XCJdfX1gXG5cbiAgY29uc3QgbWVzc2FnZXMgPSBbXG4gICAge1xuICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgY29udGVudDogW1xuICAgICAgICB7IHR5cGU6ICd2aWRlb191cmwnLCB2aWRlb191cmw6IHsgdXJsOiBvc3NVcmwgfSB9LFxuICAgICAgICB7IHR5cGU6ICd0ZXh0JywgdGV4dDogcHJvbXB0IH0sXG4gICAgICBdLFxuICAgIH0sXG4gIF1cblxuICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHtRV0VOLmJhc2VVcmx9L2NoYXQvY29tcGxldGlvbnNgLCB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgaGVhZGVyczoge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtnZXRBcGlLZXkoKX1gLFxuICAgICAgJ1gtRGFzaFNjb3BlLU9zc1Jlc291cmNlUmVzb2x2ZSc6ICdlbmFibGUnLFxuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogUVdFTi5tb2RlbCwgbWVzc2FnZXMsIG1heF90b2tlbnM6IDQwMDAgfSksXG4gIH0pXG4gIGlmICghcmVzLm9rKSB0aHJvdyBuZXcgRXJyb3IoYFF3ZW4gQVBJICR7cmVzLnN0YXR1c306ICR7YXdhaXQgcmVzLnRleHQoKX1gKVxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKVxuICByZXR1cm4gZGF0YS5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LmNvbnRlbnQgfHwgZGF0YS5jaG9pY2VzPy5bMF0/Lm1lc3NhZ2U/LnJlYXNvbmluZ19jb250ZW50IHx8IG51bGxcbn1cbiIsImNvbnN0IGFwcCA9IGF3YWl0IGltcG9ydChcIkQ6XFxcXHByb2pjZXRcXFxcZ2FtZS1hc3Npc3RhbnRcXFxcc2VydmVyLmpzXCIpXG5jb25zdCBtYWluID0gYXBwLmRlZmF1bHRcbmV4cG9ydCBkZWZhdWx0IG1haW5cbmNvbnN0IHNlcnZlID0gZ2xvYmFsVGhpc1tTeW1ib2wuZm9yKFwiYWNkZS5zZXJ2ZVwiKV1cbmlmICh0eXBlb2Ygc2VydmUgPT09IFwiZnVuY3Rpb25cIiAmJiBtYWluICYmIHR5cGVvZiBtYWluLmZldGNoID09PSBcImZ1bmN0aW9uXCIpIHNlcnZlKG1haW4pXG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVlBLFNBQVMsWUFBWTtDQUNuQixNQUFNLE1BQ0gsT0FBTyxZQUFZLGVBQWUsUUFBUSxPQUFPLFFBQVEsSUFBSSxnQkFBaUI7Q0FDakYsSUFBSSxDQUFDLEtBQUssTUFBTSxJQUFJLE1BQU0sd0NBQXdDO0NBQ2xFLE9BQU87QUFDVDtBQUdBLFNBQVMsVUFBVSxHQUFHO0NBQ3BCLE1BQU0sUUFBUSxHQUFHO0NBQ2pCLE1BQU0sV0FBVyxPQUFPLFdBQVcsT0FBTyxTQUFTLFFBQVEsT0FBTyxLQUFLLElBQUk7Q0FDM0UsT0FBTyxXQUFXLEdBQUcsR0FBRyxXQUFXLEVBQUUsV0FBVyxTQUFTLEtBQUssT0FBTyxHQUFHLFdBQVcsQ0FBQztBQUN0RjtBQWlDQSxlQUFlLGNBQWM7Q0FDM0IsSUFBSTtDQUNKLElBQUk7RUFDRixTQUFTLFVBQVU7Q0FDckIsU0FBUyxHQUFHO0VBQ1YsT0FBTztH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