export const CATEGORIES = [
  {
    name: "Brand Identity Development",
    slug: "brand-identity",
    description: "As branding experts, we create unique identities specific to each Brand's needs enabling them to stand out.",
    category_description: `Event Branding & Printing Logistics\n\nWe offer full-scale Event Branding & Print Logistics solutions, so your brand will be distinctive and memorable.\n\nOur Event Branding scope ranges from creating captivating stage designs, backdrops, roll-up banners to creating high-quality printed materials that will effectively promote your brand's products or services.\n\nReliability is absolute when delivering your brand message to your audience, and our logistics team is adequately trained to ensure your event is a success.`,
  },
  {
    name: "Web3 Branding & Product Development",
    slug: "web3-branding",
    description: "We help brands thrive in Decentralized Digital Ecosystems, across the spectrum from ideation to implementation.",
    category_description: "We provide Web3 Branding & Product Development services; helping brands thrive in Decentralized Digital Ecosystems. Across the spectrum from ideation to implementation, we make sure your brand is ready to be out front and operate in a way that speaks directly to the next generation of consumers."
  },
  {
    name: "UX/UI Design & Website Development",
    slug: "uxui-design",
    description: "We pay keen attention to user experience, this enabling consumers engross in the brand while using its platform.",
    category_description: "We create engaging and highly aesthetic digital solutions with the help of UI/UX Design & Website Development solutions. We pay extensive attention to the user experience and develop websites, which are not only beautiful but also effective and sensitive. This approach also helps to avoid such issues as getting lost in application, low attraction of users and poor performance of the final result, which gives your company’s website a proper image of your company and helps to achieve your corporate objectives."
  },
  {
    name: "Event Branding & Print Logistics",
    slug: "event-branding",
    description: "We offer full-scale Event Branding & Printing Logistics solutions, so your brand would be visible and distinctive at events.",
    category_description: "We understand that branded merchandise are mobile billboard of your brand's story.\n\nWe produce and package  Merch items like Shirts, note-pads, Umbrellas, accessories, souvenirs that captures the essence of your brand."
  },
  {
    name: "Merch Design & Packaging",
    slug: "merch-design",
    description: "We turn ideas into tangible products, delivering high-quality merchandise and memorable unboxing experience that reflects your brand identity.",
    category_description: "Event Branding & printing Logistics \n\nWe offer full-scale Event Branding & print Logistics solutions, so your brand would be distinctive and memorable.\n\nOur Event Branding scope ranges from creating captivating stage designs, backdrops, roll-up banners to creating high quality printed materials that will effectively promote your Brand's products or services.\n\nReliability is absolute when delivering your brand message to your audience and our logistics team are adequately trained to ensure your event is a success"
  },
  {
    name: "3D Modeling (AR & NFT)",
    slug: "3d-modeling",
    description: "We creates highly detailed 3D models that help in improving and give you product a virtual reality in the virtual spaces, bringing out the best of your brand.",
    category_description: "3D Modeling for AR & VR; we produce 3D models for Augmented Reality and Virtual Reality; using powerful digital environments. Our professional staff creates highly detailed 3D models that help in improving the aesthetics of the augmented and virtual spaces, bringing out the best of your brand."
  },
  {
    name: "Video Editing",
    slug: "video-editing",
    description: "Story-driven video content with engaging cuts, transitions, and sound design to elevate your message.",
    category_description: "Whether it’s a promo reel or narrative sequence, we turn raw footage into polished, compelling edits."
  },
]


export function getCategoryBySlug(slug: string) {
  return CATEGORIES.find((category) => category.slug === slug)
}

export function getCategoryByName(name: string) {
  return CATEGORIES.find((category) => category.name === name)
}

export function getSlugFromName(name: string) {
  const category = getCategoryByName(name)
  return category ? category.slug : null
}