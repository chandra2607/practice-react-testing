import React from 'react'

function Togglable({children, buttonLabel}) {
    const [showContent, setShowContent] = React.useState(false)
  return (
   <>

   <button onClick={() => setShowContent(!showContent)}>{buttonLabel}</button>
    <div style={{display:showContent?'block':'none'}}>
    {children}
    </div>
   </>
  )
}

export default Togglable; 