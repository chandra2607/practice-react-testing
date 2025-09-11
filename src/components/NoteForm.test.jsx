import { expect, test } from "vitest"
import NoteForm from "./NoteForm"
import { render, screen } from '@testing-library/react'
import userEvent from "@testing-library/user-event"

test('<NoteForm /> Functionalities Check', async () => {
    const createNote = vi.fn()
    render(<NoteForm createNote={createNote} />)
    const element = screen.getByText('Create a new note')
    expect(element).toBeDefined();
    const user = userEvent.setup();
    const formInput = screen.getByRole('textbox')
    const btn = screen.getByRole('button')
    //   formInput.nodeValue='A Content was added'
    await user.type(formInput, 'A Content was added')
    await user.click(btn);

    expect(createNote.mock.calls).toHaveLength(1);
    //    console.log(createNote.mock.calls,"CreateNote")
    expect(createNote.mock.calls[0][0].content).toBe('A Content was added')

})