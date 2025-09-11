// Make a test, which checks that the component displaying a blog renders 
// the blog's title and author, but does not render its URL or number of likes by default.

import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import BlogList from "./BlogList";
import userEvent from "@testing-library/user-event";
test('test title and author',async () => {
    const likeHandler=vi.fn()
    render(<BlogList handleLike={likeHandler} />)
    const firstBlog =
    {
        id: 1,
        title: "First Blog",
        content: "This is the content of the first blog.",
        author: "John Doe",
        url: 'https://example.com/first-blog',
        likes: 10
    }
    const user=userEvent.setup()
    // Test that title and content are visible
    const blogElement = screen.getByText(firstBlog.title)
    expect(blogElement).toBeVisible()
    
    const contentElement = screen.getByText(firstBlog.content)
    expect(contentElement).toBeVisible()
    
    // Test that author text is in the document but not visible (display: none)
    // Use getAllByText to get all instances and test the first one
    const authorElements = screen.getAllByText(firstBlog.author)
    expect(authorElements[0]).toBeInTheDocument()
    expect(authorElements[0]).not.toBeVisible()
    
    // Test that author labels are in the document but not visible
    const authorLabels = screen.getAllByText('Author:')
    expect(authorLabels[0]).toBeInTheDocument()
    expect(authorLabels[0]).not.toBeVisible()
    
    // Test that likes are in the document but not visible (display: none)  
    const likesElements = screen.getAllByText(firstBlog.likes.toString())
    expect(likesElements[0]).toBeInTheDocument()
    expect(likesElements[0]).not.toBeVisible()
    
    // Test that likes labels are in the document but not visible
    const likesLabels = screen.getAllByText('Likes:')
    expect(likesLabels[0]).toBeInTheDocument()
    expect(likesLabels[0]).not.toBeVisible()
    
    // Test that URL is not directly displayed as text (it's in href attribute)
    expect(() => screen.getByText(firstBlog.url)).toThrow()

    // check if function was clicked twice
    const button=screen.getByText('Like me')
    await user.dblClick(button)
     expect(likeHandler.mock.calls).toHaveLength(1);
    expect(likeHandler.mock.calls[0][0]).toBe('twice')
})