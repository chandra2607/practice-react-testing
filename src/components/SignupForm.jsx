import { useState } from 'react'
import { submitSignup } from '../api/mockSignupApi'

const initialData = {
  // Level 1: personal
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  // Level 2: address
  address1: '',
  address2: '',
  city: '',
  postal: '',
  // Level 3: account
  username: '',
  password: '',
  confirmPassword: '',
  // Level 4: preferences
  newsletter: false,
  contactMethod: 'email',
  interests: [],
}

const LevelOne = ({data, onChange, errors={}}) => (
  <fieldset>
    <legend>Personal</legend>
    <label>
      First name
      <input name="firstName" value={data.firstName} onChange={onChange} />
      {errors.firstName && <div className="field-error">{errors.firstName}</div>}
    </label>
    <label>
      Last name
      <input name="lastName" value={data.lastName} onChange={onChange} />
      {errors.lastName && <div className="field-error">{errors.lastName}</div>}
    </label>
    <label>
      Email
      <input name="email" value={data.email} onChange={onChange} type="email" />
      {errors.email && <div className="field-error">{errors.email}</div>}
    </label>
    <label>
      Phone
      <input name="phone" value={data.phone} onChange={onChange} />
      {errors.phone && <div className="field-error">{errors.phone}</div>}
    </label>
  </fieldset>
)

const LevelTwo = ({data, onChange, errors={}}) => (
  <fieldset>
    <legend>Address</legend>
    <label>
      Address 1
      <input name="address1" value={data.address1} onChange={onChange} />
      {errors.address1 && <div className="field-error">{errors.address1}</div>}
    </label>
    <label>
      Address 2
      <input name="address2" value={data.address2} onChange={onChange} />
    </label>
    <label>
      City
      <input name="city" value={data.city} onChange={onChange} />
      {errors.city && <div className="field-error">{errors.city}</div>}
    </label>
    <label>
      Postal Code
      <input name="postal" value={data.postal} onChange={onChange} />
      {errors.postal && <div className="field-error">{errors.postal}</div>}
    </label>
  </fieldset>
)

const LevelThree = ({data, onChange, errors={}}) => (
  <fieldset>
    <legend>Account</legend>
    <label>
      Username
      <input name="username" value={data.username} onChange={onChange} />
      {errors.username && <div className="field-error">{errors.username}</div>}
    </label>
    <label>
      Password
      <input name="password" value={data.password} onChange={onChange} type="password" />
      {errors.password && <div className="field-error">{errors.password}</div>}
    </label>
    <label>
      Confirm Password
      <input name="confirmPassword" value={data.confirmPassword} onChange={onChange} type="password" />
      {errors.confirmPassword && <div className="field-error">{errors.confirmPassword}</div>}
    </label>
  </fieldset>
)

const LevelFour = ({data, onChange, onToggleInterest, errors={}}) => (
  <fieldset>
    <legend>Preferences</legend>
    <label><input name="newsletter" type="checkbox" checked={data.newsletter} onChange={onChange} /> Subscribe to newsletter</label>
    <div className="contact-method">
      <label><input type="radio" name="contactMethod" value="email" checked={data.contactMethod==='email'} onChange={onChange} /> Email</label>
      <label><input type="radio" name="contactMethod" value="phone" checked={data.contactMethod==='phone'} onChange={onChange} /> Phone</label>
      <label><input type="radio" name="contactMethod" value="none" checked={data.contactMethod==='none'} onChange={onChange} /> None</label>
    </div>
    <div className="interests">
      <label><input type="checkbox" value="tech" checked={data.interests.includes('tech')} onChange={onToggleInterest} /> Tech</label>
      <label><input type="checkbox" value="music" checked={data.interests.includes('music')} onChange={onToggleInterest} /> Music</label>
      <label><input type="checkbox" value="sports" checked={data.interests.includes('sports')} onChange={onToggleInterest} /> Sports</label>
      <label><input type="checkbox" value="art" checked={data.interests.includes('art')} onChange={onToggleInterest} /> Art</label>
      {errors.interests && <div className="field-error">{errors.interests}</div>}
    </div>
  </fieldset>
)

export default function SignupForm({onSuccess}){
  const [data, setData] = useState(initialData)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})

  const onChange = (e) => {
    const {name, type, value, checked} = e.target
    // special handling for phone: allow only digits and max 10
    if(name === 'phone'){
      const digits = (value || '').replace(/\D/g, '').slice(0, 10)
      setData(prev => ({...prev, phone: digits}))
      setErrors(prev => { const c = {...prev}; delete c.phone; return c })
      return
    }

    setData(prev => ({...prev, [name]: type === 'checkbox' ? checked : value}))
    setErrors(prev => { const c = {...prev}; delete c[name]; return c })
  }

  const onToggleInterest = (e) => {
    const {value} = e.target
    setData(prev => {
      const has = prev.interests.includes(value)
      const next = has ? prev.interests.filter(i=>i!==value) : [...prev.interests, value]
      return {...prev, interests: next}
    })
    setErrors(prev => { const c = {...prev}; delete c.interests; return c })
  }

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  const digitsCount = (v) => (v||'').replace(/\D/g,'').length

  const validateLevel = (lvl) => {
    const e = {}
    if(lvl===1){
      if(!data.firstName) e.firstName = 'First name is required'
      if(!data.lastName) e.lastName = 'Last name is required'
      if(!data.email) e.email = 'Email is required'
      else if(!validateEmail(data.email)) e.email = 'Email is invalid'
      // phone optional, but if provided must be exactly 10 digits and start with 6-9
      if(data.phone){
        const digits = (data.phone||'').replace(/\D/g,'')
        if(digits.length !== 10) e.phone = 'Phone must be exactly 10 digits'
        else if(!/^[6-9]/.test(digits)) e.phone = 'Phone must start with 6,7,8, or 9'
      }
    }
    if(lvl===2){
      if(!data.address1) e.address1 = 'Address is required'
      if(!data.city) e.city = 'City is required'
      if(!data.postal) e.postal = 'Postal code required'
    }
    if(lvl===3){
      if(!data.username || data.username.length < 3) e.username = 'Username must be at least 3 characters'
      if(!data.password || data.password.length < 8) e.password = 'Password must be at least 8 characters'
      else if(!/\d/.test(data.password)) e.password = 'Password must include a number'
      if(data.password !== data.confirmPassword) e.confirmPassword = 'Passwords do not match'
    }
    if(lvl===4){
      // preferences mostly optional; no hard validations here
    }
    return e
  }

  const validateAll = () => ({
    ...validateLevel(1),
    ...validateLevel(2),
    ...validateLevel(3),
    ...validateLevel(4)
  })

  const next = () => {
    const e = validateLevel(step)
    if(Object.keys(e).length){
      setErrors(prev => ({...prev, ...e}))
      return
    }
    setStep(s => Math.min(4, s+1))
  }
  const prev = () => setStep(s => Math.max(1, s-1))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const all = validateAll()
    if(Object.keys(all).length){
      setErrors(all)
      // jump to first invalid step
      if(all.firstName || all.email || all.phone) setStep(1)
      else if(all.address1 || all.city || all.postal) setStep(2)
      else if(all.username || all.password || all.confirmPassword) setStep(3)
      return
    }

    setLoading(true)
    try{
      const res = await submitSignup(data)
      if(res && res.ok){
        onSuccess()
      } else {
        setError(res && res.message ? res.message : 'Signup failed')
      }
    }catch(err){
      setError(err.message || 'Network error')
    }finally{
      setLoading(false)
    }
  }

  return (
    <form className="signup-form" onSubmit={handleSubmit} noValidate>
      <div className="steps-indicator">Step {step} / 4</div>

      {step===1 && <LevelOne data={data} onChange={onChange} errors={errors} />}
      {step===2 && <LevelTwo data={data} onChange={onChange} errors={errors} />}
      {step===3 && <LevelThree data={data} onChange={onChange} errors={errors} />}
      {step===4 && <LevelFour data={data} onChange={onChange} onToggleInterest={onToggleInterest} errors={errors} />}

      <div className="form-actions">
        {step>1 && <button type="button" className="btn-secondary" onClick={prev}>Back</button>}
        {step<4 && <button type="button" className="btn-primary" onClick={next}>Next</button>}
        {step===4 && <button className="btn-submit" type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit'}</button>}
      </div>

      {error && <div className="form-error">{error}</div>}
    </form>
  )
}
