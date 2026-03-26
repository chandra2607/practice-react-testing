import { useState } from 'react'
import SignupForm from './components/SignupForm'
import ThankYou from './ThankYou'
import NoteForm from './components/NoteForm'
import './styles/SignupForm.css'

const defaultNotes = [
  {
    id: 1,
    content: 'HTML is easy',
    important: true,
  },
  {
    id: 2,
    content: 'Browser can execute only JavaScript',
    important: false,
  },
  {
    id: 3,
    content: 'GET and POST are the most important methods of HTTP protocol',
    important: true,
  },
]

const App = () => {
  const [notes, setNotes] = useState(defaultNotes)
  const addNote = (newNote) => setNotes(prev => [...prev, newNote])

  const [submitted, setSubmitted] = useState(false)
  const handleSuccess = () => setSubmitted(true)

  return (
    <div className="app-root layout">
      <section className="notes-section">
        <h1 id="main-heading">Notes</h1>
        <NoteForm createNote={addNote} />
        <div id='notes-list'>
          <h2>Notes List</h2>
          <ul>
            {notes.map((note, ind) => <li key={ind}>{note.content}</li>)}
          </ul>
        </div>
      </section>

      <aside className="signup-section">
        {!submitted ? (
          <>
            <h2 className="app-title">Create an Account</h2>
            <SignupForm onSuccess={handleSuccess} />
          </>
        ) : (
          <ThankYou />
        )}
      </aside>
    </div>
  )
}

export default App
