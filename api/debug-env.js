// 디버깅용: Solar 키 env 상태 확인
export default async function handler(req) {
  const key = process.env.SOLAR_API_KEY;
  const info = {
    hasKey: !!key,
    length: key ? key.length : 0,
    first4: key ? key.slice(0, 4) : null,
    last4: key ? key.slice(-4) : null,
    charCodes: key ? Array.from(key).map(c => c.charCodeAt(0)).slice(0, 10) : [],
    trimmedLength: key ? key.trim().length : 0,
    hasLeadingSpace: key ? key[0] === ' ' : false,
    hasTrailingSpace: key ? key[key.length - 1] === ' ' : false,
    raw: key, // 값 자체는 출력하지 않기 위해 여기에만 두고 로그에는 안 찍음
    message: '이 응답은 디버깅용. Solar 키 값은 드러나지 않음.',
  };
  console.log('[debug] SOLAR_API_KEY 상태:', JSON.stringify({
    hasKey: info.hasKey,
    length: info.length,
    trimmedLength: info.trimmedLength,
    first4: info.first4,
    last4: info.last4,
    charCodes: info.charCodes,
    hasLeadingSpace: info.hasLeadingSpace,
    hasTrailingSpace: info.hasTrailingSpace,
  }));
  return new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json' } });
}
