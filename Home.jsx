import React from 'react';

const Home = () => {
  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Navigation */}
      <header className="bg-white shadow">
        <nav className="container mx-auto flex justify-between items-center p-4">
          <a href="#" className="text-2xl font-bold">App Logo</a>
          <ul className="hidden md:flex gap-6 text-gray-700 font-medium">
            <li><a href="#" className="hover:text-purple-600">Games</a></li>
            <li><a href="#" className="hover:text-purple-600">Social</a></li>
            <li><a href="#" className="hover:text-purple-600">Plans &amp; Pricing</a></li>
            <li><a href="#" className="hover:text-purple-600">About</a></li>
          </ul>
          <div className="space-x-2">
            <button className="border border-purple-600 text-purple-600 px-4 py-2 rounded-md hover:bg-purple-50">Sign In</button>
            <button className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700">Register</button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-purple-600 to-teal-500 text-white text-center py-20 flex-grow">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-4">Welcome to App Name!</h1>
        <p className="text-xl md:text-2xl mb-8">Real Sports Memories</p>
        <div className="space-x-4">
          <button className="bg-teal-500 hover:bg-teal-600 px-6 py-3 rounded-md">Register</button>
          <button className="bg-purple-700 hover:bg-purple-800 px-6 py-3 rounded-md">Log In</button>
        </div>
      </section>

      {/* Stadium Banner */}
      <section className="relative">
        <img src="https://via.placeholder.com/1920x600" alt="Stadium" className="w-full h-64 md:h-96 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-purple-700/60 to-teal-600/60 flex items-center justify-center">
          <h2 className="text-2xl md:text-4xl font-bold text-white text-center px-4">Getting Fans in Seats at Over 600 arenas nationwide</h2>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-300 py-10">
        <div className="container mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 px-4">
          <div>
            <div className="text-white text-xl font-bold mb-4">App Logo</div>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white">X</a>
              <a href="#" className="hover:text-white">IG</a>
              <a href="#" className="hover:text-white">YT</a>
              <a href="#" className="hover:text-white">IN</a>
            </div>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Use cases</h3>
            <ul className="space-y-1">
              <li><a href="#" className="hover:text-white">UI design</a></li>
              <li><a href="#" className="hover:text-white">UX design</a></li>
              <li><a href="#" className="hover:text-white">Wireframing</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Explore</h3>
            <ul className="space-y-1">
              <li><a href="#" className="hover:text-white">Design</a></li>
              <li><a href="#" className="hover:text-white">Prototyping</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Resources</h3>
            <ul className="space-y-1">
              <li><a href="#" className="hover:text-white">Blog</a></li>
              <li><a href="#" className="hover:text-white">Best practices</a></li>
              <li><a href="#" className="hover:text-white">Colors</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
