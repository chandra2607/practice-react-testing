// Simple mock API to simulate signup handling.
// Randomly succeeds or fails unless deterministic param is provided.

export async function submitSignup(payload, {shouldFail=false, delay=900} = {}){
  // simulate network latency
  await new Promise(res => setTimeout(res, delay))

  // simple server-side validation
  if(!payload.email || !payload.username){
    return { ok: false, message: 'Missing required fields' }
  }

  // allow test harness to force failure via global flag in browser
  try{
    if(typeof window !== 'undefined' && window.__MOCK_SIGNUP_FORCE_FAIL){
      return Promise.reject(new Error('Server error: forced failure (test)'))
    }
  }catch(e){ /* ignore when not in browser */ }

  if(shouldFail){
    return Promise.reject(new Error('Server error: unable to create account'))
  }

  // simulate occasional failure
  const rand = Math.random()
  if(rand < 0.12){
    return { ok: false, message: 'Duplicate account or server rejected request' }
  }

  // success
  return { ok: true, message: 'Account created' }
}
