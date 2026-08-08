require 'xcodeproj'
project = Xcodeproj::Project.open('PocketAgent.xcodeproj')
target = project.targets.find { |t| t.name == 'PocketAgent' }
app_dir = File.expand_path('..', __dir__) # apps/pocket-agent

groups = {
  'X402Signer' => Dir.glob(File.join(__dir__, 'X402Signer', '*.swift')),
  'NitroGenerated' => Dir.glob(File.join(app_dir, 'nitrogen', 'generated', '{shared,ios}', '**', '*.{swift,mm,cpp,hpp,h}')),
}

groups.each do |name, files|
  group = project.main_group.find_subpath(name, true)
  group.set_source_tree('<absolute>')
  files.each do |f|
    next if project.files.any? { |pf| pf.real_path.to_s == File.expand_path(f) }
    ref = group.new_file(File.expand_path(f))
    if f =~ /\.(swift|mm|cpp)$/
      target.add_file_references([ref])
    end
  end
end

target.build_configurations.each do |config|
  config.build_settings['SWIFT_OBJC_INTEROP_MODE'] = 'objcxx'
  config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
  config.build_settings['HEADER_SEARCH_PATHS'] ||= ['$(inherited)']
  hs = Array(config.build_settings['HEADER_SEARCH_PATHS'])
  hs << "#{app_dir}/nitrogen/generated/shared/c++" << "#{app_dir}/nitrogen/generated/ios" << "#{__dir__}/Pods/Headers/Private/NitroModules" << "#{__dir__}/Pods/Headers/Public/NitroModules"
  config.build_settings['HEADER_SEARCH_PATHS'] = hs.uniq
end

project.save
puts "added #{groups.values.flatten.size} files; interop settings applied"
