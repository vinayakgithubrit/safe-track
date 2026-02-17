const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Search for users (for adding friends)
router.get('/search', authenticateToken, [
    query('query').isLength({ min: 2, max: 30 }).trim().escape()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { query } = req.query;
        const currentUserId = req.user.userId;

        // Search users by username or email (excluding current user and existing friends)
        const users = await User.find({
            _id: { $ne: currentUserId },
            $and: [
                {
                    $or: [
                        { username: { $regex: query, $options: 'i' } },
                        { email: { $regex: query, $options: 'i' } }
                    ]
                },
                {
                    _id: { $nin: await User.findById(currentUserId).select('friends') }
                }
            ]
        })
        .select('username email isOnline lastSeen profile')
        .limit(10)
        .exec();

        res.json({ users });

    } catch (error) {
        console.error('Friend search error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send friend request
router.post('/request/send', authenticateToken, [
    body('friendId').isMongoId()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { friendId } = req.body;
        const currentUserId = req.user.userId;

        // Check if trying to add self
        if (friendId === currentUserId) {
            return res.status(400).json({ error: 'Cannot add yourself as friend' });
        }

        // Check if friend exists
        const friend = await User.findById(friendId);
        if (!friend) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ error: 'Current user not found' });
        }

        // Check if already friends
        if (currentUser.friends.includes(friendId)) {
            return res.status(400).json({ error: 'Already friends with this user' });
        }

        // Check if request already sent
        const alreadySent = currentUser.friendRequests.sent.some(
            request => request.to.toString() === friendId
        );
        if (alreadySent) {
            return res.status(400).json({ error: 'Friend request already sent' });
        }

        // Check if request already received from this user
        const alreadyReceived = currentUser.friendRequests.received.some(
            request => request.from.toString() === friendId
        );
        if (alreadyReceived) {
            return res.status(400).json({ error: 'Friend request already received from this user' });
        }

        // Add to sent requests
        currentUser.friendRequests.sent.push({ to: friendId });
        await currentUser.save();

        // Add to received requests for the friend
        friend.friendRequests.received.push({ from: currentUserId });
        await friend.save();

        // TODO: Send real-time notification via Socket.IO
        // This will be handled in the main app.js

        res.json({ 
            message: 'Friend request sent successfully',
            friend: {
                _id: friend._id,
                username: friend.username,
                email: friend.email
            }
        });

    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Accept friend request
router.post('/request/accept', authenticateToken, [
    body('requesterId').isMongoId()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { requesterId } = req.body;
        const currentUserId = req.user.userId;

        // Get current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Find the friend request
        const requestIndex = currentUser.friendRequests.received.findIndex(
            request => request.from.toString() === requesterId
        );
        if (requestIndex === -1) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        // Get requester user
        const requester = await User.findById(requesterId);
        if (!requester) {
            return res.status(404).json({ error: 'Requester not found' });
        }

        // Add to friends list for both users
        currentUser.friends.push(requesterId);
        requester.friends.push(currentUserId);

        // Remove from received requests
        currentUser.friendRequests.received.splice(requestIndex, 1);

        // Remove from sent requests for the requester
        const sentRequestIndex = requester.friendRequests.sent.findIndex(
            request => request.to.toString() === currentUserId
        );
        if (sentRequestIndex !== -1) {
            requester.friendRequests.sent.splice(sentRequestIndex, 1);
        }

        // Save both users
        await currentUser.save();
        await requester.save();

        // TODO: Send real-time notification via Socket.IO
        // This will be handled in the main app.js

        res.json({ 
            message: 'Friend request accepted successfully',
            friend: {
                _id: requester._id,
                username: requester.username,
                email: requester.email,
                isOnline: requester.isOnline,
                lastSeen: requester.lastSeen
            }
        });

    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reject friend request
router.post('/request/reject', authenticateToken, [
    body('requesterId').isMongoId()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { requesterId } = req.body;
        const currentUserId = req.user.userId;

        // Get current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Find and remove the friend request
        const requestIndex = currentUser.friendRequests.received.findIndex(
            request => request.from.toString() === requesterId
        );
        if (requestIndex === -1) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        currentUser.friendRequests.received.splice(requestIndex, 1);

        // Get requester and remove from their sent requests
        const requester = await User.findById(requesterId);
        if (requester) {
            const sentRequestIndex = requester.friendRequests.sent.findIndex(
                request => request.to.toString() === currentUserId
            );
            if (sentRequestIndex !== -1) {
                requester.friendRequests.sent.splice(sentRequestIndex, 1);
                await requester.save();
            }
        }

        await currentUser.save();

        res.json({ message: 'Friend request rejected successfully' });

    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cancel sent friend request
router.post('/request/cancel', authenticateToken, [
    body('friendId').isMongoId()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { friendId } = req.body;
        const currentUserId = req.user.userId;

        // Get current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Find and remove the sent request
        const requestIndex = currentUser.friendRequests.sent.findIndex(
            request => request.to.toString() === friendId
        );
        if (requestIndex === -1) {
            return res.status(404).json({ error: 'Friend request not found' });
        }

        currentUser.friendRequests.sent.splice(requestIndex, 1);

        // Get friend and remove from their received requests
        const friend = await User.findById(friendId);
        if (friend) {
            const receivedRequestIndex = friend.friendRequests.received.findIndex(
                request => request.from.toString() === currentUserId
            );
            if (receivedRequestIndex !== -1) {
                friend.friendRequests.received.splice(receivedRequestIndex, 1);
                await friend.save();
            }
        }

        await currentUser.save();

        res.json({ message: 'Friend request cancelled successfully' });

    } catch (error) {
        console.error('Cancel friend request error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get friends list
router.get('/list', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;

        const user = await User.findById(currentUserId)
            .populate({
                path: 'friends',
                select: 'username email isOnline lastSeen profile',
                options: { sort: { isOnline: -1, lastSeen: -1 } }
            });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            friends: user.friends 
        });

    } catch (error) {
        console.error('Get friends list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get friend requests (both sent and received)
router.get('/requests', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;

        const user = await User.findById(currentUserId)
            .populate('friendRequests.sent.to', 'username email isOnline')
            .populate('friendRequests.received.from', 'username email isOnline');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            sent: user.friendRequests.sent,
            received: user.friendRequests.received
        });

    } catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove friend
router.delete('/remove', authenticateToken, [
    body('friendId').isMongoId()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: errors.array() 
            });
        }

        const { friendId } = req.body;
        const currentUserId = req.user.userId;

        // Get current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if friends
        const friendIndex = currentUser.friends.findIndex(
            friend => friend.toString() === friendId
        );
        if (friendIndex === -1) {
            return res.status(404).json({ error: 'Not friends with this user' });
        }

        // Remove from both users' friends lists
        currentUser.friends.splice(friendIndex, 1);

        const friend = await User.findById(friendId);
        if (friend) {
            const currentUserIndex = friend.friends.findIndex(
                f => f.toString() === currentUserId
            );
            if (currentUserIndex !== -1) {
                friend.friends.splice(currentUserIndex, 1);
                await friend.save();
            }
        }

        await currentUser.save();

        res.json({ message: 'Friend removed successfully' });

    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
