class CreateFishSpecies < ActiveRecord::Migration[8.1]
  def change
    create_table :fish_species do |t|
      t.string :name

      t.timestamps
    end
  end
end
