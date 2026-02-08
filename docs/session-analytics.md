# Session Analytics — Tracking & Diagnostics

*Last updated: February 8, 2026*

This document covers what we track in student sessions, what we can diagnose from that data, and what additional tracking is planned.

---

## Currently Tracked (Implemented)

### Per Session
| Data Point | Source | Diagnostic Value |
|---|---|---|
| Full conversation transcript | `conversations.messages` | Exact diagnosis of AI behavior, student responses |
| Per-message timestamps | `conversations.messages[].timestamp` | Response time patterns, pause detection |
| Conversation style used | `conversations.conversation_style` | Which of 6 styles works best per level/student |
| Time-on-article | `reading_sessions.reading_completed_at` vs `started_at` | Reading speed, engagement signal |
| Session duration | `reading_sessions.completed_at` vs `started_at` | Total time investment |
| Comprehension score | `comprehension_reports.score` | Understanding level |
| Self-assessment | `comprehension_reports.self_assessment` | Metacognitive accuracy |
| AI avg words/message | `comprehension_reports.ai_avg_words` | AI verbosity tracking |
| Student avg words/message | `comprehension_reports.student_avg_words` | Student engagement depth |
| Redirect/correction count | `comprehension_reports.redirect_count` | Question difficulty signal |
| Exchange count | `comprehension_reports.exchange_count` | Conversation length |
| Article liked/disliked | `articles.liked` | Content resonance |
| Article category & topic | `articles.category`, `articles.topic` | Content type performance |

### Aggregated
| Data Point | Source | Diagnostic Value |
|---|---|---|
| "Show me different" clicks | `article_feed_events` | Interest mismatch signal |
| Daily favorites | `article_favorites` | Best content identification |
| Article quality ratings | `article_ratings` | Periodic quality pulse |
| Interest suggestions | `article_feed_events.interest_suggestion` | Explicit interest updates |
| Total sessions completed | `students.total_sessions_completed` | Engagement trend |

---

## Diagnostic Queries We Can Now Run

### 1. Conversation Quality by Style
Which conversation styles produce the best comprehension scores?
```sql
SELECT c.conversation_style, AVG(cr.score) as avg_score, COUNT(*) as sessions
FROM conversations c
JOIN comprehension_reports cr ON cr.conversation_id = c.id
GROUP BY c.conversation_style
ORDER BY avg_score DESC;
```

### 2. AI Verbosity Detection
Are AI messages too long for certain reading levels?
```sql
SELECT s.reading_level, AVG(cr.ai_avg_words) as avg_ai_words, AVG(cr.student_avg_words) as avg_student_words
FROM comprehension_reports cr
JOIN conversations c ON c.id = cr.conversation_id
JOIN reading_sessions rs ON rs.id = c.reading_session_id
JOIN students s ON s.id = rs.student_id
GROUP BY s.reading_level;
```

### 3. Redirect Rate by Level
Are we asking questions that are too specific for younger readers?
```sql
SELECT s.reading_level, AVG(cr.redirect_count) as avg_redirects, AVG(cr.score) as avg_score
FROM comprehension_reports cr
JOIN conversations c ON c.id = cr.conversation_id
JOIN reading_sessions rs ON rs.id = c.reading_session_id
JOIN students s ON s.id = rs.student_id
GROUP BY s.reading_level;
```

### 4. Reading Time vs. Comprehension
Do students who spend more time reading score better?
```sql
SELECT 
  EXTRACT(EPOCH FROM (rs.reading_completed_at - rs.started_at)) / 60 as read_minutes,
  cr.score
FROM reading_sessions rs
JOIN conversations c ON c.reading_session_id = rs.id
JOIN comprehension_reports cr ON cr.conversation_id = c.id
WHERE rs.reading_completed_at IS NOT NULL;
```

### 5. Self-Assessment Calibration
Which students are overconfident vs. underconfident?
```sql
SELECT s.name, cr.self_assessment, AVG(cr.score) as avg_score, COUNT(*) as sessions
FROM comprehension_reports cr
JOIN conversations c ON c.id = cr.conversation_id
JOIN reading_sessions rs ON rs.id = c.reading_session_id
JOIN students s ON s.id = rs.student_id
GROUP BY s.name, cr.self_assessment;
```

### 6. Content Type Performance
Which article categories drive the best engagement?
```sql
SELECT a.category, AVG(cr.score) as avg_score, AVG(cr.student_avg_words) as avg_response_length
FROM articles a
JOIN reading_sessions rs ON rs.article_id = a.id
JOIN conversations c ON c.reading_session_id = rs.id
JOIN comprehension_reports cr ON cr.conversation_id = c.id
GROUP BY a.category;
```

---

## Planned Future Tracking

### High Priority

**Device type / viewport**
- Track whether student is on iPad, phone, or desktop
- Implementation: capture `navigator.userAgent` or viewport width on page load, store in reading_sessions
- Value: UX optimization per device, explains layout-related issues

**Abandonment tracking**
- Track sessions that start but don't complete
- Implementation: reading_sessions without a completedAt after 24 hours = abandoned
- Additional: track at which stage abandonment occurs (reading, conversation, self-assessment)
- Value: identifies friction points in the flow

**Article scroll/read behavior**
- Track scroll depth and time-on-page during reading
- Implementation: client-side scroll tracking, send events to `/api/articles/feed-event`
- Value: distinguishes skimmers from careful readers, detects articles that are too long

### Medium Priority

**Onboarding transcript**
- Store the full onboarding conversation for reference
- Currently: onboarding updates the interest profile but doesn't save the transcript
- Value: understand how students describe their interests

**Guide interaction tracking**
- Track which students guides look at, which reports they read
- Value: understand guide workflow, identify what data they actually use

**Error tracking**
- Log API failures, slow responses, client-side errors
- Value: reliability monitoring, identifies technical friction

### Lower Priority

**A/B testing framework**
- Test different conversation prompts, UI layouts, article formats
- Would need: variant assignment, metric tracking per variant
- Value: data-driven optimization instead of intuition

**Longitudinal reading level tracking**
- Track reading level changes over time with context (which sessions triggered changes)
- Currently: level changes happen automatically but aren't logged
- Value: demonstrates progress to parents/guides

**Session replay**
- Full client-side session recording for UX diagnosis
- Heavy implementation, privacy considerations
- Value: see exactly what the student experienced

---

## Related Documents

- [Content Selection Policy](./content-policy.md)
- [Article Pipeline](./article-pipeline.md)
- [Product Requirements](./product-requirements.md)
