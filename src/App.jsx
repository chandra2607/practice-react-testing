import { useState } from 'react'
import BlogList from './components/BlogList'
import Note from './components/Note'
import NoteForm from './components/NoteForm'

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
    content: 'This Statement Got Changed',
    important: true,
  }
]
const App = () => {
  const [notes, setNotes] = useState(defaultNotes);
  const addNote = (newNote) => {
    setNotes([...notes, newNote])
  }
  return (
    <div>
      <h1 id="main-heading">Notes</h1>
      <NoteForm createNote={addNote} />
      <div id='notes-list'>
        <h2>Notes List</h2>
        <ul>
          {
            notes.map((note, ind) => {
              return <li key={ind} style={{color:'red'}}>{note.content}</li>
            })
          }
        </ul>
      </div>
      <div style={{fontSize:'50px',marginTop:'20px'}}>
        <h1>Hello World</h1>
      </div>
      {/* <BlogList /> */}
    </div>
  )
}

export default App
