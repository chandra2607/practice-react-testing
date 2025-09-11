import React from 'react'
const blogs = [
    {
        id: 1,
        title: "First Blog",
        content: "This is the content of the first blog.",
        author: "John Doe",
        url: 'https://example.com/first-blog',
        likes: 10
    },
    {
        id: 2,
        title: "Second Blog",
        content: "This is the content of the second blog.",
        author: "Jane Smith",
        url: 'https://example.com/second-blog',
        likes: 20
    },
    {
        id: 3,
        title: "Third Blog",
        content: "This is the content of the third blog.",
        author: "Alice Johnson",
        url: 'https://example.com/third-blog',
        likes: 15
    }
]
function BlogList({handleLike}) {
    return (
        <div className='blog-list'>
            {
                blogs.map(blog => (
                    <div key={blog.id} className='blog-item'>
                        <h2>{blog.title}</h2>
                        <p>{blog.content}</p>
                        <p style={{display:'none'}}><strong>Author:</strong> {blog.author}</p>
                        <p style={{display:'none'}}><strong>Likes:</strong> {blog.likes}</p>
                        <a href={blog.url} target="_blank" rel="noopener noreferrer">Read more</a>
                    </div>
                ))
            }
            <button onDoubleClick={()=>handleLike('twice')}>Like me</button>
        </div>
    )
}

export default BlogList