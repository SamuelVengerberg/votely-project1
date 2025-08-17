import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query, addDoc, doc, updateDoc, serverTimestamp, orderBy, deleteDoc, getDocs, where, setDoc, writeBatch, arrayUnion, arrayRemove, increment, limit, startAfter } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail, updateEmail, deleteUser } from 'firebase/auth';

// --- Secure Firebase Configuration ---
// This configuration now reads from environment variables.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID
};

// --- ADMIN CONFIGURATION ---
const adminUid = "p4HH5pPZF9YmKnE3SSOFBz1FU6c2";

// --- Pre-defined Categories ---
const categories = ["Technology", "Home & Kitchen", "Books", "Travel", "Gaming", "Lifestyle", "Other"];

// --- Censored Words List ---
const badWords = ["example", "profanity", "explicit"]; // Add more words here


// --- Notification Component ---
const Notification = ({ message, type, visible }) => {
    if (!visible) return null;
    const baseStyle = "fixed top-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg text-white transition-all duration-300 z-50";
    const typeStyle = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    return <div className={`${baseStyle} ${typeStyle}`}>{message}</div>;
};

// --- Confirmation Modal Component ---
const ConfirmationModal = ({ message, onConfirm, onCancel, isOpen }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                <p className="text-lg text-gray-800 mb-4">{message}</p>
                <div className="flex justify-end space-x-2">
                    <button onClick={onCancel} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={onConfirm} className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600">Confirm</button>
                </div>
            </div>
        </div>
    );
};


// --- Component for Homepage List Cards ---
const ListCardPreview = ({ list, handleVote, navigateTo, user }) => {
    const { id, title, description, items } = list;
    const getTotalVotes = (item) => (item.baseVotes || 0) + (item.votedBy?.length || 0);

    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col border-t-4 border-indigo-500 transform hover:-translate-y-1 transition-transform duration-300">
            <div className="p-6 flex-grow">
                <h3 className="text-xl font-bold text-gray-800 font-sans">{title}</h3>
                <p className="text-gray-600 mt-2 h-12 overflow-hidden">{description}</p>
                <div className="mt-4">
                    {items.sort((a, b) => getTotalVotes(b) - getTotalVotes(a)).slice(0, 3).map((item, index) => {
                        const hasVoted = user && item.votedBy?.includes(user.uid);
                        return (
                            <div key={index} className="flex items-center justify-between mb-2">
                                <span className="text-gray-700">{index + 1}. {item.name}</span>
                                <div className="flex items-center space-x-2">
                                    <span className="font-bold text-green-600">{(getTotalVotes(item)).toLocaleString()}</span>
                                    <button onClick={() => handleVote(id, item.name)} className={`p-1 rounded-full transition-colors ${hasVoted ? 'text-indigo-500 bg-indigo-100' : 'text-gray-400 hover:text-indigo-500'}`}><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 4.293a1 1 0 00-1.414 0l-6 6a1 1 0 001.414 1.414L10 6.414l5.293 5.293a1 1 0 001.414-1.414l-6-6z"></path></svg> </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="p-4 bg-gray-50 border-t">
                 <button onClick={() => navigateTo('list', id)} className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm"> View all &rarr; </button>
            </div>
        </div>
    );
};

// --- Comment Component with Liking ---
const Comment = ({ comment, user, listId, handleDeleteComment, handleModeratorDeleteComment, handleLikeComment, handlePostReply, usersMap, listAuthorId, replies }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [showReplies, setShowReplies] = useState(false);
    const canBeTruncated = comment.text.length > 600;
    const hasLiked = user && comment.likedBy?.includes(user.uid);
    const authorUsername = usersMap[comment.authorId]?.username || 'Anonymous';
    const isAuthor = user && user.uid === comment.authorId;
    const isAdmin = user && user.uid === adminUid;
    const isListModerator = user && user.uid === listAuthorId;

    const onDeleteClick = () => {
        if (isAuthor) handleDeleteComment(listId, comment.id);
        else handleModeratorDeleteComment(listId, comment.id);
    };

    const onReplySubmit = (e) => {
        e.preventDefault();
        if(replyText.trim() === '') return;
        handlePostReply(listId, comment.id, replyText);
        setReplyText('');
        setIsReplying(false);
    };

    if (comment.isDeleted) {
        return <div className="bg-gray-100 p-3 rounded-md"><p className="text-gray-500 italic">[comment deleted]</p></div>;
    }

    return (
        <div>
            <div className="bg-gray-100 p-3 rounded-md flex justify-between items-start">
                <div>
                    <p className="text-gray-800 whitespace-pre-wrap">
                        {canBeTruncated && !isExpanded ? `${comment.text.substring(0, 600)}...` : comment.text}
                    </p>
                    {canBeTruncated && (
                        <button onClick={() => setIsExpanded(!isExpanded)} className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold mt-2"> {isExpanded ? 'Show less' : 'Show more'} </button>
                    )}
                    <div className="flex items-center mt-2 space-x-4">
                        <p className="text-xs text-gray-500"> By <span className="font-semibold">{authorUsername}</span> on {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleDateString() : 'now'} </p>
                        <div className="flex items-center">
                            <button onClick={() => handleLikeComment(listId, comment)} className={`p-1 ${hasLiked ? 'text-indigo-500' : 'text-gray-400 hover:text-indigo-500'}`}>
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"></path></svg>
                            </button>
                            <span className="text-xs text-gray-600">{(comment.likedBy?.length || 0)}</span>
                        </div>
                        <button onClick={() => setIsReplying(!isReplying)} className="text-xs text-gray-600 font-semibold hover:text-indigo-600">Reply</button>
                    </div>
                </div>
                {(isAuthor || isAdmin || isListModerator) && (
                    <button onClick={onDeleteClick} className="text-gray-400 hover:text-red-500 p-1 flex-shrink-0 ml-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd"d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd"></path></svg>
                    </button>
                )}
            </div>
            {isReplying && (
                <form onSubmit={onReplySubmit} className="ml-8 mt-2">
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} className="w-full p-2 border rounded-md" rows="2" placeholder="Write a reply..."></textarea>
                    <div className="flex justify-end space-x-2 mt-2">
                        <button type="button"onClick={() => setIsReplying(false)} className="text-sm text-gray-600">Cancel</button>
                        <button type="submit"className="text-sm bg-indigo-500 text-white px-3 py-1 rounded-md">Reply</button>
                    </div>
                </form>
            )}
            {replies?.length > 0 && (
                <div className="ml-8 mt-2">
                    <button onClick={() => setShowReplies(!showReplies)} className="text-xs text-indigo-600 font-semibold"> {showReplies ? 'Hide replies' : `View ${replies.length} replies`}</button>
                    {showReplies && (
                        <div className="mt-2 space-y-2">
                            {replies.map(reply => <Comment key={reply.id} {...{ comment: reply, user, listId, handleDeleteComment, handleModeratorDeleteComment, handleLikeComment, handlePostReply, usersMap, listAuthorId, replies: [] }} />)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Component for the Full List Page ---
const ListPage = ({ list, handleVote, handleAddItem, handleDeleteComment, handleModeratorDeleteComment, handleDeleteItem, handleReportList, handlePostReply, navigateTo, user, db, showNotification, usersMap, handleLikeComment, handleDeleteList }) => {
    const { title, description, items, id, author, flaggedBy, reportedBy } = list;
    const [newItemName, setNewItemName] = useState('');
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [visibleItems, setVisibleItems] = useState(10);
    const [showReportMenu, setShowReportMenu] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const isAuthor = user && user.uid === author;
    const isAdmin = user && user.uid === adminUid;
    const hasReported = user && (flaggedBy?.includes(user.uid) || reportedBy?.includes(user.uid));
    const getTotalVotes = (item) => (item.baseVotes || 0) + (item.votedBy?.length || 0);

    useEffect(() => {
        if (!db || !id) return;
        const commentsCol = collection(db, 'lists', id, 'comments');
        const q = query(commentsCol, orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setComments(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        });
        return unsubscribe;
    }, [db, id]);

    const handleSearchChange = (e) => {
        const query = e.target.value.toLowerCase();
        setNewItemName(e.target.value);
        if (query.trim() === '') {
            setSearchResults([]);
            return;
        }
        const sortedItems = [...items].sort((a, b) => getTotalVotes(b) - getTotalVotes(a));
        const results = sortedItems
            .map((item, index) => ({ ...item, rank: index + 1 }))
            .filter(item => item.name.toLowerCase().includes(query));
        setSearchResults(results.slice(0, 5));
    };

    const handleItemSubmit = (e) => {
        e.preventDefault();
        if (newItemName.trim() === '') return;
        handleAddItem(id, newItemName);
        setNewItemName('');
        setSearchResults([]);
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (newComment.trim() === '' || !user || user.isAnonymous) return;
        if (!user.emailVerified) {
            showNotification("Please verify your email to comment.", "error");
            return;
        }
        handlePostReply(id, null, newComment);
        setNewComment('');
    };

    const nestedComments = comments.filter(c => !c.parentId).map(parent => ({ ...parent, replies: comments.filter(reply => reply.parentId === parent.id) }));

    return (
        <div className="container mx-auto px-4 py-12">
            <button onClick={() => navigateTo('home')} className="mb-8 text-indigo-600 hover:text-indigo-800 font-semibold">&larr; Back to Home</button>
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="p-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-3xl font-bold text-gray-800">{title}</h2>
                            <p className="text-gray-600 mt-2 mb-8">{description}</p>
                        </div>
                        <div className="flex space-x-2 relative">
                           {(isAuthor || isAdmin) && (
                                <>
                                    <button onClick={() => navigateTo('edit-list', id)} className="text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 px-3 py-1 rounded-md">Edit</button>
                                    <button onClick={() => handleDeleteList(id)} className="text-sm bg-red-500 text-white hover:bg-red-600 px-3 py-1 rounded-md">Delete</button>
                                </>
                           )}
                           <button onClick={() => setShowReportMenu(!showReportMenu)} disabled={hasReported} className="p-1 rounded-full text-gray-400 hover:text-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 01-1-1V6z" clipRule="evenodd"></path></svg></button>
                           {showReportMenu && (
                               <div className="absolute right-0 mt-8 w-48 bg-white rounded-md shadow-lg z-10">
                                   <button onClick={() => { handleReportList(id, 'duplicate'); setShowReportMenu(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Flag as Duplicate</button>
                                   <button onClick={() => { handleReportList(id, 'inappropriate'); setShowReportMenu(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Report Inappropriate</button>
                               </div>
                           )}
                        </div>
                    </div>
                    <div className="mt-4 space-y-2">
                        {items.sort((a, b) => getTotalVotes(b) - getTotalVotes(a)).slice(0, visibleItems).map((item, index) => {
                            const hasVoted = user && item.votedBy?.includes(user.uid);
                            return (
                                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <span className="text-gray-800 font-medium">{index + 1}. {item.name}</span>
                                    <div className="flex items-center space-x-3">
                                        <span className="font-bold text-green-600">{getTotalVotes(item).toLocaleString()} votes</span>
                                        <button onClick={() => handleVote(id, item.name)} className={`p-1 rounded-full transition-colors ${hasVoted ? 'text-indigo-500 bg-indigo-100' : 'text-gray-400 hover:text-indigo-500'}`}>
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 4.293a1 1 0 00-1.414 0l-6 6a1 1 0 001.414 1.414L10 6.414l5.293 5.293a1 1 0 001.414-1.414l-6-6z"></path></svg>
                                        </button>
                                        {(isAuthor || isAdmin) && (
                                            <button onClick={() => handleDeleteItem(id, item.name)} className="text-gray-400 hover:text-red-500 p-1 rounded-full">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd"d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {items.length > visibleItems && (
                        <button onClick={() => setVisibleItems(items.length)} className="w-full mt-4 text-indigo-600 hover:text-indigo-800 font-semibold text-sm">Show All Items</button>
                    )}
                </div>
                <div className="p-6 bg-gray-50 border-t relative">
                     <form onSubmit={handleItemSubmit}>
                        <div className="flex space-x-2">
                            <input type="text" value={newItemName} onChange={handleSearchChange} placeholder="Vote for an existing item or add a new one..." className="flex-grow px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">Add</button>
                        </div>
                     </form>
                     {searchResults.length > 0 && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 mx-6">
                            {searchResults.map(item => (
                                <button key={item.name} onClick={() => { handleVote(id, item.name); setNewItemName(''); setSearchResults([]); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 flex justify-between">
                                    <span>#{item.rank} {item.name}</span>
                                    <span className="text-gray-500">{getTotalVotes(item).toLocaleString()} votes</span>
                                </button>
                            ))}
                        </div>
                     )}
                </div>
                <div className="p-8 border-t">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Discussion</h3>
                    {user && !user.isAnonymous && (
                        <form onSubmit={handleCommentSubmit} className="mb-6">
                            <textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Share your thoughts..." className="w-full px-3 py-2 border rounded-lg" rows="3" maxLength="10000"></textarea>
                            <button type="submit" className="mt-2 bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">Post Comment</button>
                        </form>
                    )}
                    <div className="space-y-4">
                        {nestedComments.map(comment => (
                           <Comment key={comment.id} {...{ comment, user, listId: id, handleDeleteComment, handleModeratorDeleteComment, handleLikeComment, handlePostReply, usersMap, listAuthorId: author, replies: comment.replies }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Component for Authentication Page ---
const AuthPage = ({ auth, db, navigateTo, showNotification, isSignUpMode }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [isSignUp, setIsSignUp] = useState(isSignUpMode);
    const [error, setError] = useState('');

    useEffect(() => {
        setIsSignUp(isSignUpMode);
    }, [isSignUpMode]);

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (isSignUp) {
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("username", "==", username));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    setError("Username is already taken.");
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await sendEmailVerification(user);
                showNotification("Account created! A verification link has been sent to your email.", "success");

                await setDoc(doc(db, "users", user.uid), { username, lastListCreatedAt: null });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            navigateTo('home');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="container mx-auto px-4 py-16 flex justify-center">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-lg shadow-xl p-8">
                    <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">{isSignUp ? 'Create an Account' : 'Log In'}</h2>
                    <form onSubmit={handleAuth}>
                        {isSignUp && (
                            <div className="mb-4">
                                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">Username</label>
                                <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required />
                            </div>
                        )}
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">Email</label>
                            <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Password</label>
                            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required />
                        </div>
                        {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
                        <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-all shadow-md">
                            {isSignUp ? 'Sign Up' : 'Log In'}
                        </button>
                    </form>
                    <p className="text-center text-gray-600 text-sm mt-6">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                        <button onClick={() => setIsSignUp(!isSignUp)} className="text-indigo-600 hover:text-indigo-800 font-bold ml-1">
                            {isSignUp ? 'Log In' : 'Sign Up'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- Component for Creating/Editing a List ---
const ListFormPage = ({ handleCreateList, handleUpdateList, navigateTo, listToEdit, showNotification }) => {
    const [title, setTitle] = useState(listToEdit?.title || '');
    const [description, setDescription] = useState(listToEdit?.description || '');
    const [category, setCategory] = useState(listToEdit?.category || '');
    const isEditing = !!listToEdit;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim().startsWith('Best ')) {
            showNotification("Title must start with 'Best ' (capital B, followed by a space).", "error");
            return;
        }
        if (!title.trim() || !description.trim() || !category) return;
        if (isEditing) {
            handleUpdateList(listToEdit.id, { title, description, category });
        } else {
            handleCreateList(title, description, category);
        }
    };

    return (
        <div className="container mx-auto px-4 py-12">
            <button onClick={() => navigateTo(isEditing ? 'list' : 'home', isEditing ? listToEdit.id : null)} className="mb-8 text-indigo-600 hover:text-indigo-800 font-semibold">&larr; Back</button>
            <div className="w-full max-w-2xl mx-auto">
                <div className="bg-white rounded-lg shadow-xl p-8">
                    <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">{isEditing ? 'Edit List' : 'Create a New List'}</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="title">List Title</label>
                            <input type="text" id="title" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Best Coffee Grinders" required />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">Description</label>
                            <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="A short description of your list" required />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="category">Category</label>
                            <select id="category" value={category} onChange={e => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white" required>
                                <option value="" disabled>Select a category</option>
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-all shadow-md">
                            {isEditing ? 'Save Changes' : 'Create List'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const HowItWorksStep = ({ icon, title, text }) => (
     <div className="text-center">
        <div className="bg-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 shadow-lg">{icon}</div>
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <p className="text-gray-600 mt-1">{text}</p>
    </div>
);

// --- Component for Account Management ---
const AccountPage = ({ auth, user, showNotification, navigateTo }) => {
    const [newEmail, setNewEmail] = useState('');
    const [confirmDelete, setConfirmDelete] = useState('');

    // Handle Email Update
    const handleUpdateEmail = async (e) => {
        e.preventDefault();
        if (!newEmail || newEmail === user.email) return;
        try {
            await updateEmail(user, newEmail);
            showNotification("Email updated successfully! Please re-verify your new email.", 'success');
            setNewEmail('');
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // Handle Password Reset
    const handlePasswordReset = async () => {
        try {
            await sendPasswordResetEmail(auth, user.email);
            showNotification(`A password reset link has been sent to ${user.email}.`, 'success');
        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // Handle Account Deletion
    const handleDeleteAccount = async () => {
        if (confirmDelete !== 'DELETE') {
            showNotification("Please type 'DELETE' to confirm.", 'error');
            return;
        }
        try {
            await deleteUser(user);
            showNotification("Account deleted successfully.", 'success');
            navigateTo('home');
        } catch (error) {
            showNotification(`Error: ${error.message}. You may need to log out and log back in to delete your account.`, 'error');
        }
    };

    if (!user) return null;

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h2 className="text-3xl font-bold text-gray-800 mb-8">Account Settings</h2>
            
            {/* --- Update Email --- */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">Update Email</h3>
                <p className="text-sm text-gray-600 mb-2">Current Email: <span className="font-medium">{user.email}</span></p>
                <form onSubmit={handleUpdateEmail} className="flex space-x-2">
                    <input 
                        type="email" 
                        value={newEmail} 
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter new email" 
                        className="flex-grow px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 text-sm font-semibold rounded-lg hover:bg-indigo-700">Update</button>
                </form>
            </div>

            {/* --- Update Password --- */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Update Password</h3>
                <p className="text-sm text-gray-600 mb-4">For security reasons, password changes are handled via email.</p>
                <button onClick={handlePasswordReset} className="bg-gray-200 text-gray-700 px-4 py-2 text-sm font-semibold rounded-lg hover:bg-gray-300">Send Password Reset Email</button>
            </div>

            {/* --- Delete Account --- */}
            <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-red-200">
                <h3 className="text-xl font-semibold text-red-700 mb-2">Danger Zone</h3>
                <p className="text-sm text-gray-600 mb-4">This action is permanent and cannot be undone. All your data will be removed.</p>
                <div className="flex items-center space-x-2">
                    <input 
                        type="text" 
                        value={confirmDelete}
                        onChange={(e) => setConfirmDelete(e.target.value)}
                        placeholder="Type 'DELETE' to confirm"
                        className="flex-grow px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button onClick={handleDeleteAccount} className="bg-red-500 text-white px-4 py-2 text-sm font-semibold rounded-lg hover:bg-red-600">Delete Account</button>
                </div>
            </div>
        </div>
    );
};

// --- About Us Page Component ---
const AboutPage = () => (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">About Votely</h2>
            <div className="space-y-4 text-gray-700">
                <p>Welcome to Votely, the place where the best recommendations rise to the top.</p>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">Our Mission</h3>
                <p>In a world saturated with sponsored reviews and biased opinions, finding honest recommendations you can actually trust is harder than ever. Votely was created to solve that problem. Our mission is to empower communities to collectively decide what's best, creating definitive, unbiased rankings for everything from the best coffee maker to the best travel destinations.</p>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">How It Works</h3>
                <p>Votely is powered by you. Our platform is built on a simple principle: the wisdom of the crowd is more reliable than the opinion of a single expert.</p>
                <ul className="list-disc list-inside space-y-2">
                    <li><strong>Create a List:</strong> Anyone can start a list for any category they can think of.</li>
                    <li><strong>Add an Item:</strong> Have a favorite product, place, or movie? Add it to a list for others to discover.</li>
                    <li><strong>Vote:</strong> Upvote the items you agree with. The more votes an item gets, the higher it climbs in the rankings.</li>
                    <li><strong>Discuss:</strong> Share your experiences and opinions in the comments to help others make informed decisions.</li>
                </ul>
                <p>Our goal is to create a transparent and community-driven platform where the best of everything can be discovered and celebrated. Thank you for being a part of our community.</p>
            </div>
        </div>
    </div>
);

// --- Terms and Conditions Page Component ---
const TermsPage = () => (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Terms and Conditions</h2>
            <p className="text-sm text-gray-500 mb-6">Last Updated: August 17, 2025</p>
            <div className="space-y-4 text-gray-700">
                <p>Welcome to Votely! These terms and conditions outline the rules and regulations for the use of our website.</p>
                <p>By accessing this website, we assume you accept these terms and conditions. Do not continue to use Votely if you do not agree to all of the terms and conditions stated on this page.</p>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">1. User Accounts</h3>
                <ul className="list-disc list-inside space-y-2">
                    <li>To contribute content or vote on our platform, you may be required to create an account. You are responsible for maintaining the confidentiality of your account and password.</li>
                    <li>You must be at least 13 years of age to use this service.</li>
                    <li>You agree to provide accurate and complete information when creating your account.</li>
                </ul>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">2. User-Generated Content</h3>
                <ul className="list-disc list-inside space-y-2">
                    <li>You are solely responsible for the content you post, including lists, items, and comments. You grant Votely a non-exclusive, royalty-free, perpetual, and worldwide license to use, reproduce, and display your content in connection with the service.</li>
                    <li>You agree not to post content that is illegal, obscene, defamatory, threatening, infringing on intellectual property rights, or otherwise injurious to third parties.</li>
                    <li>We reserve the right, but not the obligation, to remove or edit any content that violates these terms.</li>
                </ul>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">3. Prohibited Activities</h3>
                <p>You are specifically restricted from all of the following:</p>
                <ul className="list-disc list-inside space-y-2">
                    <li>Using this website in any way that is or may be damaging to this website.</li>
                    <li>Using this website in any way that impacts user access to this website.</li>
                    <li>Engaging in any data mining, data harvesting, data extracting, or any other similar activity in relation to this website.</li>
                    <li>Using this website to engage in any advertising or marketing without our prior written consent.</li>
                </ul>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">4. Limitation of Liability</h3>
                <p>In no event shall Votely, nor any of its officers, directors, and employees, be held liable for anything arising out of or in any way connected with your use of this website. The content on this website represents the opinions of its users and not of Votely.</p>
                <h3 className="text-xl font-semibold text-gray-800 pt-4">5. Changes to Terms</h3>
                <p>We reserve the right to revise these terms and conditions at any time. By using this website, you are expected to review these terms on a regular basis.</p>
            </div>
        </div>
    </div>
);

// --- Contact Us Page Component ---
const ContactPage = () => (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">Contact Us</h2>
            <p className="text-gray-600 mb-8">We'd love to hear from you! Whether you have a question, feedback, or a suggestion, please don't hesitate to get in touch.</p>
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-semibold text-gray-800">General Inquiries</h3>
                    <p className="text-gray-600 mt-1">For all general questions, feedback, and support requests, please email us at:</p>
                    <a href="mailto:support@vote-ly.com" className="text-indigo-600 hover:underline">support@vote-ly.com</a>
                </div>
                <div>
                    <h3 className="text-xl font-semibold text-gray-800">Partnership Inquiries</h3>
                    <p className="text-gray-600 mt-1">If you are interested in partnering with Votely, please contact our partnerships team at:</p>
                    <a href="mailto:partnerships@vote-ly.com" className="text-indigo-600 hover:underline">partnerships@vote-ly.com</a>
                </div>
            </div>
        </div>
    </div>
);


// --- Main App Component ---
export default function App() {
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [user, setUser] = useState(null);
    const [usersMap, setUsersMap] = useState({});
    const [currentPage, setCurrentPage] = useState('home');
    const [currentListId, setCurrentListId] = useState(null);
    const [authIsSignUp, setAuthIsSignUp] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [notification, setNotification] = useState({ message: '', type: '', visible: false });
    const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, listId: null });
    const [homePage, setHomePage] = useState(1); 
    const LISTS_PER_PAGE = 4;

    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type, visible: true });
        setTimeout(() => setNotification({ message: '', type: '', visible: false }), 3000);
    }, []);

    const censorText = (text) => {
        return badWords.reduce((acc, word) => acc.replace(new RegExp(word, 'gi'), '*'.repeat(word.length)), text);
    };

    const seedDatabase = useCallback(async () => {
        if (!db) return;
        const sampleLists = [
            { title: "Best Wireless Headphones", description: "For music lovers, commuters, and everyone in between.", category: "Technology", items: [ { name: "Sony WH-1000XM5", baseVotes: 1204, votedBy: [] }, { name: "Bose QuietComfort Ultra", baseVotes: 987, votedBy: [] }, { name: "Apple AirPods Max", baseVotes: 852, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best VPN Service", description: "Stay secure and private online with top-rated VPNs.", category: "Technology", items: [ { name: "ExpressVPN", baseVotes: 2512, votedBy: [] }, { name: "NordVPN", baseVotes: 2109, votedBy: [] }, { name: "Surfshark", baseVotes: 1765, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Robot Vacuum", description: "Keep your floors clean with minimal effort.", category: "Home & Kitchen", items: [ { name: "Roborock S8 Pro Ultra", baseVotes: 1843, votedBy: [] }, { name: "iRobot Roomba j7+", baseVotes: 1521, votedBy: [] }, { name: "Eufy Clean X8 Pro", baseVotes: 1198, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Science Fiction Books", description: "Explore new worlds and mind-bending concepts.", category: "Books", items: [ { name: "Dune by Frank Herbert", baseVotes: 3102, votedBy: [] }, { name: "The Hitchhiker's Guide to the Galaxy", baseVotes: 2845, votedBy: [] }, { name: "Neuromancer by William Gibson", baseVotes: 1984, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best European Cities for a Weekend Trip", description: "Incredible destinations for a short getaway.", category: "Travel", items: [ { name: "Lisbon, Portugal", baseVotes: 2341, votedBy: [] }, { name: "Prague, Czech Republic", baseVotes: 2112, votedBy: [] }, { name: "Budapest, Hungary", baseVotes: 1899, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Board Games for Parties", description: "Fun and engaging games for your next get-together.", category: "Gaming", items: [ { name: "Codenames", baseVotes: 4123, votedBy: [] }, { name: "Jackbox Party Pack", baseVotes: 3587, votedBy: [] }, { name: "Cards Against Humanity", baseVotes: 3101, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best At-Home Coffee Makers", description: "Brew the perfect cup without leaving your house.", category: "Home & Kitchen", items: [ { name: "Technivorm Moccamaster", baseVotes: 1543, votedBy: [] }, { name: "Breville Barista Express", baseVotes: 1321, votedBy: [] }, { name: "AeroPress", baseVotes: 1198, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Hiking Trails in North America", description: "Breathtaking views and unforgettable adventures.", category: "Travel", items: [ { name: "Zion Narrows, Utah", baseVotes: 2890, votedBy: [] }, { name: "Grinnell Glacier, Montana", baseVotes: 2453, votedBy: [] }, { name: "West Coast Trail, British Columbia", baseVotes: 1765, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Productivity Apps", description: "Tools to help you get more done.", category: "Technology", items: [ { name: "Notion", baseVotes: 3876, votedBy: [] }, { name: "Todoist", baseVotes: 3123, votedBy: [] }, { name: "Evernote", baseVotes: 2456, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Fantasy Book Series", description: "Epic sagas and magical worlds to get lost in.", category: "Books", items: [ { name: "The Lord of the Rings by J.R.R. Tolkien", baseVotes: 4589, votedBy: [] }, { name: "A Song of Ice and Fire by George R.R. Martin", baseVotes: 4123, votedBy: [] }, { name: "Mistborn by Brandon Sanderson", baseVotes: 3876, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Wireless Gaming Mouse", description: "Cut the cord without sacrificing performance.", category: "Gaming", items: [ { name: "Logitech G Pro X Superlight", baseVotes: 2987, votedBy: [] }, { name: "Razer Viper V2 Pro", baseVotes: 2543, votedBy: [] }, { name: "SteelSeries Aerox 5 Wireless", baseVotes: 1987, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
            { title: "Best Skincare Products for Beginners", description: "Start your skincare journey with these essentials.", category: "Lifestyle", items: [ { name: "CeraVe Hydrating Cleanser", baseVotes: 3456, votedBy: [] }, { name: "The Ordinary Hyaluronic Acid", baseVotes: 2987, votedBy: [] }, { name: "La Roche-Posay Anthelios Sunscreen", baseVotes: 2345, votedBy: [] } ], author: 'system', createdAt: serverTimestamp() },
        ];

        for (const list of sampleLists) {
            await addDoc(collection(db, 'lists'), list);
        }
        showNotification("Sample lists added!", "success");
    }, [db, showNotification]);

    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestoreDb);
        setAuth(firebaseAuth);

        const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (currentUser) =>{
            setUser(currentUser);
            if (!currentUser) {
                signInAnonymously(firebaseAuth).catch(err => console.error("Anonymous sign-in failed:", err));
            }
        });

        const usersCol = collection(firestoreDb, 'users');
        const unsubscribeUsers = onSnapshot(usersCol, (snapshot) => {
            const newUsersMap = {};
            snapshot.forEach(doc => {
                newUsersMap[doc.id] = doc.data();
            });
            setUsersMap(newUsersMap);
        });

        return () => {
            unsubscribeAuth();
            unsubscribeUsers();
        };
    }, []);

    useEffect(() => {
        if (!user || !db) {
            setLoading(true);
            return;
        }
        const listsCollection = collection(db, 'lists');
        const q = query(listsCollection);
        const unsubscribeFirestore = onSnapshot(q, (querySnapshot) => {
            const listsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if(listsData.length === 0) {
                seedDatabase();
            }
            setLists(listsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching lists: ", error);
            setLoading(false);
        });
        return unsubscribeFirestore;
    }, [user, db, seedDatabase]);

    const navigateTo = (page, data = null) => {
        setCurrentPage(page);
        setCurrentListId(data);
        if (page === 'auth') setAuthIsSignUp(data);
    };

    const handleLogout = async () => {
        if (!auth) return;
        await signOut(auth);
        navigateTo('home');
    };

    const handleVote = async (listId, itemName) => {
        if (!db || !user || user.isAnonymous) return showNotification("Please log in to vote!", "error");
        if (!user.emailVerified) return showNotification("Please verify your email to vote.", "error");
    
        const listDocRef = doc(db, 'lists', listId);
        const listToUpdate = lists.find(list => list.id === listId);
        if (!listToUpdate) return;
    
        const userId = user.uid;
    
        const isTogglingOff = listToUpdate.items.find(item => item.name === itemName)?.votedBy?.includes(userId);
    
        const updatedItems = listToUpdate.items.map(item => {
            const newVotedBy = (item.votedBy || []).filter(uid => uid !== userId);
    
            if (item.name === itemName && !isTogglingOff) {
                newVotedBy.push(userId);
            }
    
            return { ...item, votedBy: newVotedBy };
        });
    
        await updateDoc(listDocRef, { items: updatedItems });
    };

    const handleAddItem = async (listId, newItemName) => {
        if (!db || !user || user.isAnonymous) return showNotification("Please log in to add items!", "error");
        if (!user.emailVerified) return showNotification("Please verify your email to add items.", "error");
    
        const listDocRef = doc(db, 'lists', listId);
        const listToUpdate = lists.find(list => list.id === listId);
        if (!listToUpdate) return;
    
        if (listToUpdate.items.some(item => item.name.toLowerCase() === newItemName.toLowerCase())) {
            return showNotification("This item is already in the list!", "error");
        }
    
        let wasReplaced = false;
        const filteredItems = listToUpdate.items.filter(item => {
            if (item.addedBy === user.uid) {
                wasReplaced = true;
                return false;
            }
            return true;
        });
    
        const newItem = {
            name: censorText(newItemName),
            votedBy: [user.uid],
            baseVotes: 0,
            addedBy: user.uid
        };
    
        const finalItems = [...filteredItems, newItem];
    
        await updateDoc(listDocRef, { items: finalItems });
    
        if (wasReplaced) {
            showNotification("Your previous submission has been replaced.", "success");
        } else {
            showNotification("Item added successfully!", "success");
        }
    };

    const handleCreateList = async (title, description, category) => {
        if (!db || !user || user.isAnonymous) return showNotification("Please log in to create a list!", "error");
        if (!user.emailVerified) return showNotification("Please verify your email to create lists.", "error");
        const currentUserData = usersMap[user.uid];
        const timeSinceLastPost = currentUserData?.lastListCreatedAt ? Date.now() - currentUserData.lastListCreatedAt.toMillis() : Infinity;
        if (timeSinceLastPost < 600000) { // 10 minutes
            return showNotification(`Please wait ${Math.ceil((600000 - timeSinceLastPost) / 60000)} minutes.`, "error");
        }
        const newList = { title: censorText(title), description: censorText(description), category, items: [], author: user.uid, createdAt: serverTimestamp() };
        try {
            await addDoc(collection(db, 'lists'), newList);
            await updateDoc(doc(db, "users", user.uid), { lastListCreatedAt: serverTimestamp() });
            navigateTo('home');
            showNotification("List created successfully!", "success");
        } catch (error) {
            console.error("Error creating list: ", error);
            showNotification("Failed to create list.", "error");
        }
    };

    const handleDeleteComment = async (listId, commentId) => {
        if (!db) return;
        try {
            await deleteDoc(doc(db, 'lists', listId, 'comments', commentId));
            showNotification("Comment deleted.", "success");
        } catch (error) {
            console.error("Error deleting comment: ", error);
            showNotification("Failed to delete comment.", "error");
        }
    };

    const handleLikeComment = async (listId, comment) => {
        if (!db || !user || user.isAnonymous) return showNotification("Please log in to like comments!", "error");
        if (!user.emailVerified) return showNotification("Please verify your email to like comments.", "error");
        const commentDocRef = doc(db, 'lists', listId, 'comments', comment.id);
        const hasLiked = comment.likedBy?.includes(user.uid);
        try {
            if (hasLiked) {
                await updateDoc(commentDocRef, { likedBy: arrayRemove(user.uid) });
            } else {
                await updateDoc(commentDocRef, { likedBy: arrayUnion(user.uid) });
            }
        } catch(error) {
            console.error("Error liking comment:", error);
            showNotification("Failed to update like.", "error");
        }
    };

    const handleDeleteList = (listId) => {
        setDeleteConfirmation({ isOpen: true, listId });
    };

    const confirmDeleteList = async () => {
        const { listId } = deleteConfirmation;
        if (!db || !listId) return;
        const listDocRef = doc(db, 'lists', listId);
        const commentsRef = collection(db, 'lists', listId, 'comments');
        try {
            const batch = writeBatch(db);
            const commentsSnapshot = await getDocs(commentsRef);
            commentsSnapshot.forEach(commentDoc => batch.delete(commentDoc.ref));
            batch.delete(listDocRef);
            await batch.commit();
            showNotification("List deleted successfully.", "success");
            navigateTo('home');
        } catch (error) {
            console.error("Error deleting list: ", error);
            showNotification("Failed to delete list.", "error");
        } finally {
            setDeleteConfirmation({ isOpen: false, listId: null });
        }
    };

    const handleUpdateList = async (listId, updatedData) => {
        if (!db) return;
        const listDocRef = doc(db, 'lists', listId);
        try {
            await updateDoc(listDocRef, { title: censorText(updatedData.title), description: censorText(updatedData.description), category: updatedData.category });
            showNotification("List updated successfully!", "success");
            navigateTo('list', listId);
        } catch (error) {
            console.error("Error updating list: ", error);
            showNotification("Failed to update list.", "error");
        }
    };

    const handleReportList = async (listId, reportType) => {
        if (!db || !user || user.isAnonymous) return showNotification("Please log in to flag lists.", "error");
        if(!user.emailVerified) return showNotification("Please verify your email to flag content.", "error");
        const listDocRef = doc(db, 'lists', listId);
        const fieldToUpdate = reportType === 'duplicate' ? 'flaggedBy' : 'reportedBy';
        try {
            await updateDoc(listDocRef, { [fieldToUpdate]: arrayUnion(user.uid) });
            showNotification("Report submitted. Thank you.", "success");
        } catch (error) {
            console.error("Error flagging list: ", error);
            showNotification("Failed to submit report.", "error");
        }
    };

    const handlePostReply = async (listId, parentId, text) => {
        if (!db || !user || user.isAnonymous) return showNotification("Please log in to comment.", "error");
        if (!user.emailVerified) return showNotification("Please verify your email to comment.", "error");
        const newCommentData = { text: censorText(text), authorId: user.uid, createdAt: serverTimestamp(), likedBy: [], parentId: parentId || null, replyCount: 0, isDeleted: false, };
        try {
            await addDoc(collection(db, 'lists', listId, 'comments'), newCommentData);
            if (parentId) {
                await updateDoc(doc(db, 'lists', listId, 'comments', parentId), { replyCount: increment(1) });
            }
        } catch (error) {
            console.error("Error posting comment: ", error);
            showNotification("Failed to post comment.", "error");
        }
    };

    const handleModeratorDeleteComment = async (listId, commentId) => {
        if (!db) return;
        const commentDocRef = doc(db, 'lists', listId, 'comments', commentId);
        try {
            await updateDoc(commentDocRef, { isDeleted: true, text: "[comment deleted]" });
            showNotification("Comment removed.", "success");
        } catch (error) {
            console.error("Error removing comment: ", error);
            showNotification("Failed to remove comment.", "error");
        }
    };

    const handleDeleteItem = async (listId, itemName) => {
        if (!db) return;
        const listDocRef = doc(db, 'lists', listId);
        const listToUpdate = lists.find(list => list.id === listId);
        if (!listToUpdate) return;
        const updatedItems = listToUpdate.items.filter(item => item.name !== itemName);
        try {
            await updateDoc(listDocRef, { items: updatedItems });
            showNotification("Item removed from list.", "success");
        } catch (error) {
            console.error("Error deleting item: ", error);
            showNotification("Failed to delete item.", "error");
        }
    };

    const filteredLists = lists.filter(list => {
        const searchTermLower = searchTerm.toLowerCase();
        return (!selectedCategory || list.category === selectedCategory) && (list.title.toLowerCase().includes(searchTermLower) || list.description.toLowerCase().includes(searchTermLower));
    });

    const selectedList = lists.find(list => list.id === currentListId);

    const renderHomePage = () => {
        const getListTotalVotes = (list) => list.items.reduce((sum, item) => sum + (item.baseVotes || 0) + (item.votedBy?.length || 0), 0);
        const sortedLists = [...filteredLists].sort((a, b) => getListTotalVotes(b) - getListTotalVotes(a));
        const pageCount = Math.ceil(sortedLists.length / LISTS_PER_PAGE);
        const startIndex = (homePage - 1) * LISTS_PER_PAGE;
        const endIndex = startIndex + LISTS_PER_PAGE;
        const paginatedLists = sortedLists.slice(startIndex, endIndex);

        return (
            <>
                <section className="bg-gradient-to-br from-gray-50 to-gray-100">
                    <div className="container mx-auto px-4 py-20 text-center">
                        <h1 className="text-4xl md:text-6xl font-bold text-gray-800 leading-tight">Find the best of everything.</h1>
                        <p className="text-lg md:text-xl text-gray-600 mt-4 max-w-2xl mx-auto">Community-driven rankings you can trust.</p>
                        <div className="mt-8">
                            <input type="text" placeholder="Search for anything (e.g. 'best coffee maker')" className="w-full md:w-1/2 px-4 py-3 rounded-lg border-2 border-gray-200 focus:outline-none focus:border-indigo-500 transition-colors" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setHomePage(1); }} />
                        </div>
                    </div>
                </section>
                <main className="container mx-auto px-4 py-16">
                    <div className="mb-12">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Browse by Category</h3>
                        <div className="flex flex-wrap justify-center gap-2">
                            <button onClick={() => { setSelectedCategory(null); setHomePage(1); }} className={`px-4 py-2 text-sm font-semibold rounded-full ${!selectedCategory ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>All</button>
                            {categories.map(cat => (
                                <button key={cat} onClick={() => { setSelectedCategory(cat); setHomePage(1); }} className={`px-4 py-2 text-sm font-semibold rounded-full ${selectedCategory === cat ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{cat}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-3xl font-bold text-gray-800">Popular Lists</h2>
                        {user && !user.isAnonymous && (
                            <button onClick={() => navigateTo('create-list')} className="bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors shadow-sm">Create a List</button>
                        )}
                    </div>
                    {loading ? <p className="text-center text-gray-500">Loading...</p> : paginatedLists.length > 0 ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {paginatedLists.map(list => <ListCardPreview key={list.id} {...{ list, handleVote, navigateTo, user }} />)}
                            </div>
                            {pageCount > 1 && (
                                <div className="flex justify-center items-center mt-12 space-x-4">
                                    <button onClick={() => setHomePage(prev => prev - 1)} disabled={homePage === 1} className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">&larr; Previous</button>
                                    <span className="text-sm text-gray-700">Page {homePage} of {pageCount}</span>
                                    <button onClick={() => setHomePage(prev => prev + 1)} disabled={homePage === pageCount} className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Next &rarr;</button>
                                </div>
                            )}
                        </>
                    ) : (<p className="text-center text-gray-500">No lists found. Try a different search!</p>)}
                </main>
                <section className="bg-gray-50 border-t border-b border-gray-200">
                    <div className="container mx-auto px-4 py-20">
                        <h2 className="text-3xl font-bold text-center text-gray-800 mb-12">How It Works</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                            <HowItWorksStep icon={<svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>} title="Create a List" text="Start a list for any category you can think of." />
                            <HowItWorksStep icon={<svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg>} title="Vote on Items" text="Upvote your favorite items to help them rise to the top." />
                            <HowItWorksStep icon={<svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round"strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>} title="Discuss" text="Share your experiences and help the community decide." />
                        </div>
                    </div>
                </section>
            </>
        );
    };

    const renderContent = () => {
        if (loading && !user) {
            return <p className="text-center text-gray-500 py-10">Connecting...</p>;
        }
        switch (currentPage) {
            case 'list':
                return selectedList ? <ListPage {...{ list: selectedList, handleVote, handleAddItem, handleDeleteComment, handleModeratorDeleteComment, handleDeleteItem, handleLikeComment, handleReportList, handlePostReply, handleDeleteList, navigateTo, user, db, showNotification, usersMap }} /> : renderHomePage();
            case 'auth':
                return <AuthPage {...{ auth, db, navigateTo, showNotification, isSignUpMode: authIsSignUp }} />;
            case 'create-list':
                return <ListFormPage {...{ handleCreateList, navigateTo, showNotification }} />;
            case 'edit-list':
                return <ListFormPage {...{ handleUpdateList, navigateTo, listToEdit: selectedList, showNotification }} />;
            case 'account':
                return <AccountPage {...{ auth, user, showNotification, navigateTo }} />;
            case 'about':
                return <AboutPage />;
            case 'terms':
                return <TermsPage />;
            case 'contact':
                return <ContactPage />;
            default:
                return renderHomePage();
        }
    };

    return (
        <div className="bg-gray-100 font-sans">
            <style> {`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap'); .font-sans { font-family: 'Poppins', sans-serif; }`} </style>
            <Notification {...notification} />
            <ConfirmationModal isOpen={deleteConfirmation.isOpen} message="Are you sure you want to permanently delete this list and all its comments?" onConfirm={confirmDeleteList} onCancel={() => setDeleteConfirmation({ isOpen: false, listId: null })} />
            <header className="bg-white shadow-sm sticky top-0 z-10">
                <div className="container mx-auto px-4">
                    <div className="flex justify-between items-center py-4">
                        <div className="text-2xl font-bold text-indigo-600 cursor-pointer" onClick={() => navigateTo('home')}>Votely</div>
                        <div className="hidden md:flex items-center space-x-6">
                            {user && !user.isAnonymous ? (
                                <>
                                    <button onClick={() => navigateTo('account')} className="text-gray-600 text-sm font-semibold hover:text-indigo-600">{usersMap[user.uid]?.username || user.email}</button>
                                    <button onClick={handleLogout} className="text-gray-600 hover:text-indigo-600">Logout</button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => navigateTo('auth', false)} className="text-gray-600 hover:text-indigo-600">Login</button>
                                    <button onClick={() => navigateTo('auth', true)} className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 shadow-sm transition-all">Sign Up</button>
                                </>
                            )}
                        </div>
                        <div className="md:hidden"><button className="text-gray-600 hover:text-gray-900"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg></button></div>
                    </div>
                </div>
            </header>
            {renderContent()}
            <footer className="bg-white border-t">
                <div className="container mx-auto px-4 py-6 text-center text-gray-600">
                    <div className="flex justify-center space-x-6 mb-4">
                        <button onClick={() => navigateTo('about')} className="text-sm text-gray-500 hover:text-indigo-600">About Us</button>
                        <button onClick={() => navigateTo('terms')} className="text-sm text-gray-500 hover:text-indigo-600">Terms & Conditions</button>
                        <button onClick={() => navigateTo('contact')} className="text-sm text-gray-500 hover:text-indigo-600">Contact Us</button>
                    </div>
                    <p>&copy; {new Date().getFullYear()} Votely. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
