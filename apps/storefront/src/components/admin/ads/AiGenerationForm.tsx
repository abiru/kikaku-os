'use client'

import { useState } from 'react'
import { Button } from '../../catalyst/button'
import { Input } from '../../catalyst/input'
import { Textarea } from '../../catalyst/textarea'
import { Select } from '../../catalyst/select'
import { Field, Label } from '../../catalyst/fieldset'

export function AiGenerationForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [productName, setProductName] = useState('')
  const [finalUrl, setFinalUrl] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [keywords, setKeywords] = useState('')
  const [tone, setTone] = useState('professional')
  const [language, setLanguage] = useState('ja')
  const [adType, setAdType] = useState('search')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const keywordList = keywords.split(',').map((k) => k.trim()).filter((k) => k)

    if (keywordList.length === 0) {
      setError('Please enter at least one keyword')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/ads/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productName,
          productDescription,
          targetAudience,
          keywords: keywordList,
          tone,
          language,
          adType,
          finalUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate ad copy')
      }

      alert('Ad copy generated successfully! Redirecting to inbox for review...')
      window.location.href = '/admin/inbox'
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
      <h2 className="text-xl font-semibold text-zinc-950 mb-4">AI Ad Generation</h2>
      <p className="text-sm text-gray-600 mb-6">
        Generate multiple ad variations using AI. Fill in the product details below and click "Generate with AI".
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label>Product Name <span className="text-red-500">*</span></Label>
            <Input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
          </Field>

          <Field>
            <Label>Landing Page URL <span className="text-red-500">*</span></Label>
            <Input
              type="url"
              value={finalUrl}
              onChange={(e) => setFinalUrl(e.target.value)}
              required
              placeholder="https://example.com/product"
            />
          </Field>
        </div>

        <Field>
          <Label>Product Description <span className="text-red-500">*</span></Label>
          <Textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            required
            rows={3}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label>Target Audience <span className="text-red-500">*</span></Label>
            <Input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              required
              placeholder="e.g., Small business owners"
            />
          </Field>

          <Field>
            <Label>Keywords <span className="text-red-500">*</span></Label>
            <Input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              required
              placeholder="keyword1, keyword2, keyword3"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field>
            <Label>Tone</Label>
            <Select value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="urgent">Urgent</option>
              <option value="informative">Informative</option>
            </Select>
          </Field>

          <Field>
            <Label>Language</Label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="ja">Japanese</option>
              <option value="en">English</option>
            </Select>
          </Field>

          <Field>
            <Label>Ad Type</Label>
            <Select value={adType} onChange={(e) => setAdType(e.target.value)}>
              <option value="search">Search</option>
              <option value="display">Display</option>
              <option value="performance_max">Performance Max</option>
            </Select>
          </Field>
        </div>

        <div>
          <Button type="submit" color="indigo" disabled={isLoading}>
            {isLoading ? 'Generating...' : 'Generate with AI'}
          </Button>
        </div>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-6 text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
          <p className="mt-4 text-sm text-gray-600">Generating ad variations with AI...</p>
          <p className="mt-2 text-xs text-gray-500">Results will be sent to inbox for review.</p>
        </div>
      )}
    </div>
  )
}
