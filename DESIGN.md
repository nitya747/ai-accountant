# Corpus Tax AI — Design Language v1.0

## Product Positioning

**Corpus is not a chatbot.**
It is an AI Tax Accountant.

The interface should feel like:

> Professional CA + Modern SaaS + AI Assistant

### Avoid
* Generic ChatGPT clones
* Banking dashboards
* Government portals
* Crypto-style fintech aesthetics
* Neon/glow effects

---

## Brand Personality

### Core Traits
* **Trustworthy**
* **Intelligent**
* **Professional**
* **Calm**
* **Structured**
* **Premium**

### Emotional Goal
The user should feel:
> "I can confidently make tax decisions here."

---

## Color System

### Primary
* **Teal 700**: `#0F766E`
* **Teal 600**: `#0D9488`
* **Teal 100**: `#DFF7F4`

### Secondary
* **Brass**: `#C79A3B`
* **Soft Brass**: `#EFD9A5`

### Neutrals
* **Ivory**: `#FAF8F3`
* **Background**: `#F7F7F5`
* **Border**: `#E7E5E4`
* **Text Primary**: `#222222`
* **Text Secondary**: `#6B7280`

---

## Design Principles

### 1. Structured over Minimal
Do not return large text blobs. Use:
* Cards
* Tables
* Calculation blocks
* Comparison layouts
* Checklists

### 2. Professional over Friendly
* ❌ Emojis everywhere
* ❌ Playful illustrations
* ❌ Excessive gradients
* ✅ Clean icons
* ✅ Subtle highlights
* ✅ Financial-document aesthetic

### 3. Data First
Tax answers should look like reports. Every answer should try to include:
* Summary
* Calculation
* Result
* Tax implication

---

## Typography

### Headings
* **Font**: Inter
* **Weight**: 600–700

### Body
* **Font**: Inter
* **Weight**: 400–500

### Numbers
* **Font**: IBM Plex Sans
* **Reason**: Excellent readability for tax calculations.

---

## Icon System
* **Library**: Solar Icons
* **Style**: Linear

### Avoid
* Filled icons
* Cartoon icons
* Duotone icons

---

## Layout

### Sidebar Width
* **Desktop**: 280px
* **Collapsed**: 72px

### Main Content
* **Max Width**: 1100px
* **Alignment**: Center aligned
* *Avoid ultra-wide chat layouts.*

---

## Sidebar

### Structure
1. Logo
2. New Chat Button
3. Recent Chats
4. Pinned Chats
5. User Profile

### Active Chat
* **Background**: Teal 100
* **Border**: Teal 600
* **Radius**: 14px

---

## Chat Interface

### User Message
* **Background**: White
* **Border**: 1px solid neutral border
* **Radius**: 20px
* **Position**: Right aligned

### AI Message
* **Background**: White
* **Border**: 1px solid border
* **Radius**: 24px
* **Shadow**: Very subtle
* **Position**: Left aligned

---

## AI Response Architecture
Every answer should follow this structure:

1. **Summary**: Short answer.
2. **Analysis**: Step-by-step reasoning.
3. **Calculation**: Presented in cards/tables.
4. **Recommendation**: What the user should do.

---

## Specialized Components

### Tax Calculation Card
Contains:
* Formula
* Inputs
* Result

**Visual Hierarchy**:
* Large result number
* Medium labels
* Muted metadata

### Regime Comparison Card
Two-column layout:
* Old Regime vs New Regime
* Highlight the recommended option.

### Deduction Card
Shows:
* Section
* Amount
* Eligibility
* Status

### Compliance Timeline
Visual checklist:
* [ ] Pending
* [/] In Progress
* [x] Completed

---

## Chat Composer
* **Height**: 56px
* **Radius**: 18px
* **Background**: White
* **Border**: 1px solid neutral

### Left Actions
* Attachment
* Document Upload

### Right Actions
* Send
* Voice Input

---

## Micro Interactions
* **Duration**: 200ms
* **Easing**: `ease-out`

### Hover
* **Lift**: 2px

### Active
* **Scale**: 0.98

### Focus
* Teal outline (2px)

---

## Empty State
* **Headline**: "Ask any question about Indian taxation."
* **Suggestions**:
  * Compare old vs new regime
  * Calculate capital gains tax
  * Section 80C deductions
  * House property income

---

## Dark Mode
* **Background**: `#0D1117`
* **Surface**: `#161B22`
* **Border**: `#2D333B`
* **Text**: `#E6EDF3`
* **Teal**: Same brand teal
* **Brass**: Same brand brass
* *Never use blue accents.*

---

## Visual Keywords
If a designer rebuilds Corpus from scratch, the UI should feel:
* Premium, Calm, Financial, Advisor-like, Structured, Trustworthy, Modern Indian fintech

It should **NOT** feel:
* Hacker, Crypto, Gaming, Government portal, Generic AI chat
